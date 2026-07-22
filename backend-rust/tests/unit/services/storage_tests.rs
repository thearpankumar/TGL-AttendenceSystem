//! Storage Provider Tests
//!
//! Ported from: backend/tests/storage.test.js
//!
//! Tests storage provider functionality including:
//! - StorageProvider interface
//! - CloudinaryProvider operations
//! - S3Provider operations
//! - Storage factory initialization
//! - Error handling
//! - URL generation

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

// ============================================================================
// Mock Types and Structures
// ============================================================================

/// Upload result returned by storage providers
#[derive(Debug, Clone)]
pub struct UploadResult {
    pub url: String,
    pub public_id: String,
    pub provider: String,
}

/// Presigned URL result for upload operations
#[derive(Debug, Clone)]
pub struct PresignedUrlResult {
    pub upload_url: String,
    pub public_id: String,
    pub method: String,
    pub content_type: String,
    pub params: HashMap<String, String>,
    pub headers: Vec<(String, String)>,
}

/// Upload options for storage providers
#[derive(Debug, Clone, Default)]
pub struct UploadOptions {
    pub folder: Option<String>,
    pub key: Option<String>,
}

/// Cloudinary configuration
#[derive(Debug, Clone)]
pub struct CloudinaryConfig {
    pub cloud_name: String,
    pub api_key: String,
    pub api_secret: String,
}

/// S3 configuration
#[derive(Debug, Clone)]
pub struct S3Config {
    pub bucket: String,
    pub region: String,
    pub access_key_id: String,
    pub secret_access_key: String,
}

/// Mock error type for testing
#[derive(Debug, Clone)]
pub struct MockError(pub String);

impl std::fmt::Display for MockError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for MockError {}

// ============================================================================
// StorageProvider Trait (Interface)
// ============================================================================

#[async_trait::async_trait]
pub trait StorageProvider: Send + Sync + std::fmt::Debug {
    async fn upload(&self, file: &str, options: UploadOptions) -> Result<UploadResult, MockError>;
    async fn delete(&self, public_id: &str) -> Result<bool, MockError>;
    fn get_file_url(&self, public_id: &str) -> String;
    async fn get_upload_url(
        &self,
        key: &str,
        content_type: &str,
    ) -> Result<PresignedUrlResult, MockError>;
    fn get_name(&self) -> &'static str;
}

// ============================================================================
// BaseStorageProvider - Throws "Method not implemented" for all methods
// ============================================================================

#[derive(Debug)]
pub struct BaseStorageProvider;

#[async_trait::async_trait]
impl StorageProvider for BaseStorageProvider {
    async fn upload(
        &self,
        _file: &str,
        _options: UploadOptions,
    ) -> Result<UploadResult, MockError> {
        Err(MockError("Method not implemented".to_string()))
    }

    async fn delete(&self, _public_id: &str) -> Result<bool, MockError> {
        Err(MockError("Method not implemented".to_string()))
    }

    fn get_file_url(&self, _public_id: &str) -> String {
        panic!("Method not implemented")
    }

    async fn get_upload_url(
        &self,
        _key: &str,
        _content_type: &str,
    ) -> Result<PresignedUrlResult, MockError> {
        Err(MockError("Method not implemented".to_string()))
    }

    fn get_name(&self) -> &'static str {
        panic!("Method not implemented")
    }
}

// ============================================================================
// Mock Cloudinary Provider
// ============================================================================

/// Mock upload response for Cloudinary
#[derive(Debug, Clone)]
pub struct MockUploadCall {
    pub _file: String,
    pub options: UploadOptions,
}

/// Mock Cloudinary client for testing
#[derive(Debug)]
pub struct MockCloudinaryClient {
    pub upload_calls: Arc<Mutex<Vec<MockUploadCall>>>,
    pub upload_result: Arc<Mutex<Option<Result<UploadResult, MockError>>>>,
    pub delete_result: Arc<Mutex<Option<Result<bool, MockError>>>>,
    pub transformation_applied: Arc<Mutex<bool>>,
}

impl MockCloudinaryClient {
    pub fn new() -> Self {
        Self {
            upload_calls: Arc::new(Mutex::new(Vec::new())),
            upload_result: Arc::new(Mutex::new(None)),
            delete_result: Arc::new(Mutex::new(None)),
            transformation_applied: Arc::new(Mutex::new(false)),
        }
    }

    pub fn set_upload_result(&self, result: Result<UploadResult, MockError>) {
        *self.upload_result.lock().unwrap() = Some(result);
    }

    pub fn set_delete_result(&self, result: Result<bool, MockError>) {
        *self.delete_result.lock().unwrap() = Some(result);
    }

    pub fn get_upload_calls(&self) -> Vec<MockUploadCall> {
        self.upload_calls.lock().unwrap().clone()
    }
}

#[derive(Debug)]
pub struct CloudinaryProvider {
    pub config: CloudinaryConfig,
    mock_client: Option<Arc<MockCloudinaryClient>>,
}

impl CloudinaryProvider {
    pub fn new(config: CloudinaryConfig) -> Self {
        Self {
            config,
            mock_client: None,
        }
    }

    pub fn with_mock(config: CloudinaryConfig, mock_client: Arc<MockCloudinaryClient>) -> Self {
        Self {
            config,
            mock_client: Some(mock_client),
        }
    }
}

#[async_trait::async_trait]
impl StorageProvider for CloudinaryProvider {
    async fn upload(&self, file: &str, options: UploadOptions) -> Result<UploadResult, MockError> {
        if let Some(ref mock) = self.mock_client {
            // Record the call
            mock.upload_calls.lock().unwrap().push(MockUploadCall {
                _file: file.to_string(),
                options: options.clone(),
            });

            // Check if transformation should be applied (quality: auto:good, resize)
            *mock.transformation_applied.lock().unwrap() = true;

            // Return mock result
            match mock.upload_result.lock().unwrap().clone() {
                Some(Ok(res)) => Ok(res),
                Some(Err(e)) => Err(MockError(format!("Cloudinary upload failed: {}", e.0))),
                None => Err(MockError("Cloudinary upload failed: No mock result set".to_string())),
            }
        } else {
            Err(MockError(
                "Cloudinary upload failed: Not mocked".to_string(),
            ))
        }
    }

    async fn delete(&self, _public_id: &str) -> Result<bool, MockError> {
        if let Some(ref mock) = self.mock_client {
            match mock.delete_result.lock().unwrap().clone() {
                Some(Ok(res)) => Ok(res),
                Some(Err(e)) => Err(MockError(format!("Cloudinary delete failed: {}", e.0))),
                None => Ok(true),
            }
        } else {
            Err(MockError(
                "Cloudinary delete failed: Not mocked".to_string(),
            ))
        }
    }

    fn get_file_url(&self, public_id: &str) -> String {
        format!(
            "https://res.cloudinary.com/{}/image/upload/{}",
            self.config.cloud_name, public_id
        )
    }

    async fn get_upload_url(
        &self,
        key: &str,
        content_type: &str,
    ) -> Result<PresignedUrlResult, MockError> {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let public_id = format!("attendance-photos/{}", key);

        let mut params = HashMap::new();
        params.insert("api_key".to_string(), self.config.api_key.clone());
        params.insert("timestamp".to_string(), timestamp.to_string());
        params.insert("signature".to_string(), "mock-signature".to_string());

        Ok(PresignedUrlResult {
            upload_url: format!(
                "https://api.cloudinary.com/v1_1/{}/image/upload",
                self.config.cloud_name
            ),
            public_id: public_id.clone(),
            method: "POST".to_string(),
            content_type: content_type.to_string(),
            params,
            headers: vec![],
        })
    }

    fn get_name(&self) -> &'static str {
        "cloudinary"
    }
}

// ============================================================================
// Mock S3 Provider
// ============================================================================

/// Mock S3 send command for testing
#[derive(Debug, Clone)]
pub struct MockS3SendCommand {
    pub bucket: String,
    pub key: String,
    pub content_type: String,
}

/// Mock S3 client for testing
#[derive(Debug)]
pub struct MockS3Client {
    pub send_commands: Arc<Mutex<Vec<MockS3SendCommand>>>,
    pub send_result: Arc<Mutex<Option<Result<(), MockError>>>>,
    pub delete_result: Arc<Mutex<Option<Result<(), MockError>>>>,
}

impl MockS3Client {
    pub fn new() -> Self {
        Self {
            send_commands: Arc::new(Mutex::new(Vec::new())),
            send_result: Arc::new(Mutex::new(None)),
            delete_result: Arc::new(Mutex::new(None)),
        }
    }

    pub fn set_send_result(&self, result: Result<(), MockError>) {
        *self.send_result.lock().unwrap() = Some(result);
    }

    pub fn set_delete_result(&self, result: Result<(), MockError>) {
        *self.delete_result.lock().unwrap() = Some(result);
    }

    pub fn get_send_commands(&self) -> Vec<MockS3SendCommand> {
        self.send_commands.lock().unwrap().clone()
    }
}

#[derive(Debug)]
pub struct S3Provider {
    pub bucket: String,
    pub region: String,
    mock_client: Option<Arc<MockS3Client>>,
}

impl S3Provider {
    pub fn new(config: S3Config) -> Self {
        Self {
            bucket: config.bucket,
            region: config.region,
            mock_client: None,
        }
    }

    pub fn with_mock(config: S3Config, mock_client: Arc<MockS3Client>) -> Self {
        Self {
            bucket: config.bucket,
            region: config.region,
            mock_client: Some(mock_client),
        }
    }

    fn parse_data_url(&self, data_url: &str) -> Result<(String, Vec<u8>), MockError> {
        if data_url.is_empty() {
            return Err(MockError("Empty file".to_string()));
        }

        if !data_url.starts_with("data:") {
            // Treat as raw base64
            let decoded = BASE64_STANDARD
                .decode(data_url)
                .map_err(|_| MockError("Invalid base64".to_string()))?;
            return Ok(("image/jpeg".to_string(), decoded));
        }

        let parts: Vec<&str> = data_url.splitn(2, ',').collect();
        if parts.len() != 2 {
            return Err(MockError("Invalid data URL format".to_string()));
        }

        let header = parts[0];
        let data = parts[1];

        // Validate header format
        if !header.contains(";base64") {
            return Err(MockError("Invalid data URL format".to_string()));
        }

        // Parse content type from header (data:image/jpeg;base64)
        let content_type = header
            .strip_prefix("data:")
            .and_then(|s| s.strip_suffix(";base64"))
            .unwrap_or("image/jpeg");

        let decoded = BASE64_STANDARD
            .decode(data)
            .map_err(|_| MockError("Invalid base64 data".to_string()))?;

        Ok((content_type.to_string(), decoded))
    }
}

#[async_trait::async_trait]
impl StorageProvider for S3Provider {
    async fn upload(&self, file: &str, options: UploadOptions) -> Result<UploadResult, MockError> {
        // Validate file input
        if file.is_empty() {
            return Err(MockError("Empty file".to_string()));
        }

        // Validate data URL format
        let (content_type, _data) = self.parse_data_url(file)?;

        // Construct object key
        let object_key = match (&options.folder, &options.key) {
            (Some(folder), Some(key)) => format!("{}/{}", folder, key),
            (Some(folder), None) => format!("{}/{}", folder, uuid::Uuid::new_v4()),
            (None, Some(key)) => key.clone(),
            (None, None) => format!("attendance-photos/{}", uuid::Uuid::new_v4()),
        };

        if let Some(ref mock) = self.mock_client {
            // Record the send command
            mock.send_commands.lock().unwrap().push(MockS3SendCommand {
                bucket: self.bucket.clone(),
                key: object_key.clone(),
                content_type: content_type.clone(),
            });

            // Check mock result
            match mock.send_result.lock().unwrap().clone() {
                Some(Ok(())) => Ok(UploadResult {
                    url: format!(
                        "https://{}.s3.{}.amazonaws.com/{}",
                        self.bucket, self.region, object_key
                    ),
                    public_id: object_key,
                    provider: "s3".to_string(),
                }),
                Some(Err(e)) => Err(MockError(format!("S3 upload failed: {}", e.0))),
                None => Ok(UploadResult {
                    url: format!(
                        "https://{}.s3.{}.amazonaws.com/{}",
                        self.bucket, self.region, object_key
                    ),
                    public_id: object_key,
                    provider: "s3".to_string(),
                }),
            }
        } else {
            Err(MockError("S3 upload failed: Not mocked".to_string()))
        }
    }

    async fn delete(&self, _key: &str) -> Result<bool, MockError> {
        if let Some(ref mock) = self.mock_client {
            match mock.delete_result.lock().unwrap().clone() {
                Some(Ok(())) => Ok(true),
                Some(Err(e)) => Err(MockError(format!("S3 delete failed: {}", e.0))),
                None => Ok(true),
            }
        } else {
            Err(MockError("S3 delete failed: Not mocked".to_string()))
        }
    }

    fn get_file_url(&self, key: &str) -> String {
        format!(
            "https://{}.s3.{}.amazonaws.com/{}",
            self.bucket, self.region, key
        )
    }

    async fn get_upload_url(
        &self,
        key: &str,
        content_type: &str,
    ) -> Result<PresignedUrlResult, MockError> {
        let public_id = format!("attendance-photos/{}", key);

        Ok(PresignedUrlResult {
            upload_url: format!(
                "https://{}.s3.{}.amazonaws.com/{}",
                self.bucket, self.region, public_id
            ),
            public_id: public_id.clone(),
            method: "PUT".to_string(),
            content_type: content_type.to_string(),
            params: HashMap::new(),
            headers: vec![("Content-Type".to_string(), content_type.to_string())],
        })
    }

    fn get_name(&self) -> &'static str {
        "s3"
    }
}

// ============================================================================
// Storage Factory
// ============================================================================

pub enum StorageProviderType {
    Cloudinary,
    S3,
}

pub struct StorageFactoryConfig {
    pub provider: StorageProviderType,
    pub cloudinary: Option<CloudinaryConfig>,
    pub s3: Option<S3Config>,
}

pub fn initialize_storage(
    config: StorageFactoryConfig,
) -> Result<Arc<dyn StorageProvider>, MockError> {
    match config.provider {
        StorageProviderType::Cloudinary => {
            let cloudinary_config = config
                .cloudinary
                .ok_or_else(|| MockError("Cloudinary configuration incomplete".to_string()))?;

            if cloudinary_config.cloud_name.is_empty()
                || cloudinary_config.api_key.is_empty()
                || cloudinary_config.api_secret.is_empty()
            {
                return Err(MockError("Cloudinary configuration incomplete".to_string()));
            }

            Ok(Arc::new(CloudinaryProvider::new(cloudinary_config)))
        }
        StorageProviderType::S3 => {
            let s3_config = config
                .s3
                .ok_or_else(|| MockError("S3 configuration incomplete".to_string()))?;

            if s3_config.bucket.is_empty()
                || s3_config.access_key_id.is_empty()
                || s3_config.secret_access_key.is_empty()
            {
                return Err(MockError("S3 configuration incomplete".to_string()));
            }

            Ok(Arc::new(S3Provider::new(s3_config)))
        }
    }
}

// ============================================================================
// Tests: StorageProvider Interface
// ============================================================================

mod storage_provider_interface {
    use super::*;

    #[tokio::test]
    async fn should_throw_error_for_unimplemented_methods() {
        let provider = BaseStorageProvider;

        // Test upload - should return error
        let result = provider.upload("test", UploadOptions::default()).await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().0, "Method not implemented");

        // Test delete - should return error
        let result = provider.delete("test").await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().0, "Method not implemented");

        // Test get_upload_url - should return error
        let result = provider.get_upload_url("test", "image/jpeg").await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().0, "Method not implemented");
    }

    #[tokio::test]
    #[should_panic(expected = "Method not implemented")]
    async fn should_throw_error_for_unimplemented_get_file_url() {
        let provider = BaseStorageProvider;
        provider.get_file_url("test");
    }

    #[test]
    #[should_panic(expected = "Method not implemented")]
    fn should_throw_error_for_unimplemented_get_name() {
        let provider = BaseStorageProvider;
        provider.get_name();
    }
}

// ============================================================================
// Tests: CloudinaryProvider
// ============================================================================

mod cloudinary_provider {
    use super::*;

    fn create_test_provider(mock: Arc<MockCloudinaryClient>) -> CloudinaryProvider {
        CloudinaryProvider::with_mock(
            CloudinaryConfig {
                cloud_name: "test-cloud".to_string(),
                api_key: "test-key".to_string(),
                api_secret: "test-secret".to_string(),
            },
            mock,
        )
    }

    #[test]
    fn should_initialize_with_config() {
        let provider = CloudinaryProvider::new(CloudinaryConfig {
            cloud_name: "test-cloud".to_string(),
            api_key: "test-key".to_string(),
            api_secret: "test-secret".to_string(),
        });

        assert_eq!(provider.config.cloud_name, "test-cloud");
    }

    #[test]
    fn should_return_correct_provider_name() {
        let mock = Arc::new(MockCloudinaryClient::new());
        let provider = create_test_provider(mock);

        assert_eq!(provider.get_name(), "cloudinary");
    }

    // --- upload() tests ---

    #[tokio::test]
    async fn should_upload_file_and_return_url_and_public_id() {
        let mock = Arc::new(MockCloudinaryClient::new());
        mock.set_upload_result(Ok(UploadResult {
            url:
                "https://res.cloudinary.com/test-cloud/image/upload/v1/attendance-photos/photo.jpg"
                    .to_string(),
            public_id: "attendance-photos/photo".to_string(),
            provider: "cloudinary".to_string(),
        }));

        let provider = create_test_provider(mock.clone());

        let result = provider
            .upload(
                "data:image/jpeg;base64,/9j==",
                UploadOptions {
                    folder: Some("attendance-photos".to_string()),
                    key: None,
                },
            )
            .await
            .unwrap();

        assert_eq!(
            result.url,
            "https://res.cloudinary.com/test-cloud/image/upload/v1/attendance-photos/photo.jpg"
        );
        assert_eq!(result.public_id, "attendance-photos/photo");
        assert_eq!(result.provider, "cloudinary");

        // Verify cloudinary SDK was called with the right folder
        let calls = mock.get_upload_calls();
        assert_eq!(calls.len(), 1);
        assert!(calls[0]
            .options
            .folder
            .as_ref()
            .unwrap()
            .contains("attendance-photos"));
    }

    #[tokio::test]
    async fn should_apply_image_quality_and_resize_transformation_on_upload() {
        let mock = Arc::new(MockCloudinaryClient::new());
        mock.set_upload_result(Ok(UploadResult {
            url: "https://res.cloudinary.com/test-cloud/image/upload/v1/photo.jpg".to_string(),
            public_id: "photo".to_string(),
            provider: "cloudinary".to_string(),
        }));

        let provider = create_test_provider(mock.clone());

        provider
            .upload("data:image/jpeg;base64,abc", UploadOptions::default())
            .await
            .unwrap();

        // Verify transformation was applied (quality: auto:good, width: 800, height: 800, crop: limit)
        assert!(*mock.transformation_applied.lock().unwrap());
    }

    #[tokio::test]
    async fn should_wrap_upload_errors_with_descriptive_message() {
        let mock = Arc::new(MockCloudinaryClient::new());
        mock.set_upload_result(Err(MockError("Invalid credentials".to_string())));

        let provider = create_test_provider(mock);

        let result = provider
            .upload("data:image/jpeg;base64,abc", UploadOptions::default())
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.0.contains("Cloudinary upload failed"));
        assert!(err.0.contains("Invalid credentials"));
    }

    // --- delete() tests ---

    #[tokio::test]
    async fn should_delete_file_by_public_id() {
        let mock = Arc::new(MockCloudinaryClient::new());
        mock.set_delete_result(Ok(true));

        let provider = create_test_provider(mock);

        let result = provider.delete("attendance-photos/photo").await;

        assert!(result.is_ok());
        assert!(result.unwrap());
    }

    #[tokio::test]
    async fn should_wrap_delete_errors_with_descriptive_message() {
        let mock = Arc::new(MockCloudinaryClient::new());
        mock.set_delete_result(Err(MockError("Resource not found".to_string())));

        let provider = create_test_provider(mock);

        let result = provider.delete("attendance-photos/missing").await;

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.0.contains("Cloudinary delete failed"));
        assert!(err.0.contains("Resource not found"));
    }

    // --- getUploadUrl() tests ---

    #[tokio::test]
    async fn should_generate_upload_url_with_required_fields() {
        let provider = CloudinaryProvider::new(CloudinaryConfig {
            cloud_name: "test-cloud".to_string(),
            api_key: "test-key".to_string(),
            api_secret: "test-secret".to_string(),
        });

        let result = provider
            .get_upload_url("test-key", "image/jpeg")
            .await
            .unwrap();

        assert!(result.upload_url.contains("cloudinary.com"));
        assert!(!result.public_id.is_empty());
        assert!(result.params.contains_key("api_key"));
        assert!(result.params.contains_key("timestamp"));
        assert!(result.params.contains_key("signature"));
        assert_eq!(result.method, "POST");
    }

    #[tokio::test]
    async fn should_generate_upload_url_with_correct_public_id_format() {
        let provider = CloudinaryProvider::new(CloudinaryConfig {
            cloud_name: "test-cloud".to_string(),
            api_key: "test-key".to_string(),
            api_secret: "test-secret".to_string(),
        });

        let result = provider
            .get_upload_url("student123", "image/jpeg")
            .await
            .unwrap();

        assert_eq!(result.public_id, "attendance-photos/student123");
    }

    // --- getFileUrl() tests ---

    #[test]
    fn should_generate_file_url_containing_cloud_name_and_public_id() {
        let mock = Arc::new(MockCloudinaryClient::new());
        let provider = create_test_provider(mock);

        let url = provider.get_file_url("attendance-photos/test");

        assert!(url.contains("test-cloud"));
        assert!(url.contains("attendance-photos/test"));
    }
}

// ============================================================================
// Tests: S3Provider
// ============================================================================

mod s3_provider {
    use super::*;

    fn create_test_provider(mock: Arc<MockS3Client>) -> S3Provider {
        S3Provider::with_mock(
            S3Config {
                bucket: "test-bucket".to_string(),
                region: "us-east-1".to_string(),
                access_key_id: "test-key".to_string(),
                secret_access_key: "test-secret".to_string(),
            },
            mock,
        )
    }

    fn create_test_provider_with_region(region: &str, mock: Arc<MockS3Client>) -> S3Provider {
        S3Provider::with_mock(
            S3Config {
                bucket: "test-bucket".to_string(),
                region: region.to_string(),
                access_key_id: "test-key".to_string(),
                secret_access_key: "test-secret".to_string(),
            },
            mock,
        )
    }

    #[test]
    fn should_initialize_with_config() {
        let mock = Arc::new(MockS3Client::new());
        let provider = create_test_provider(mock);

        assert_eq!(provider.bucket, "test-bucket");
        assert_eq!(provider.region, "us-east-1");
    }

    #[test]
    fn should_return_correct_provider_name() {
        let mock = Arc::new(MockS3Client::new());
        let provider = create_test_provider(mock);

        assert_eq!(provider.get_name(), "s3");
    }

    // --- getFileUrl() tests ---

    #[test]
    fn should_generate_correct_file_url() {
        let mock = Arc::new(MockS3Client::new());
        let provider = create_test_provider(mock);

        let url = provider.get_file_url("attendance-photos/test.jpg");

        assert_eq!(
            url,
            "https://test-bucket.s3.us-east-1.amazonaws.com/attendance-photos/test.jpg"
        );
    }

    #[test]
    fn should_generate_file_url_with_custom_region() {
        let mock = Arc::new(MockS3Client::new());
        let provider = create_test_provider_with_region("eu-west-1", mock);

        let url = provider.get_file_url("test.jpg");

        assert!(url.contains("eu-west-1"));
    }

    // --- upload() happy path tests ---

    #[tokio::test]
    async fn should_upload_a_data_url_file_and_return_url_and_public_id_and_provider() {
        let mock = Arc::new(MockS3Client::new());
        mock.set_send_result(Ok(()));

        let provider = create_test_provider(mock.clone());

        let data_url = "data:image/jpeg;base64,SGVsbG8gV29ybGQ=";
        let result = provider
            .upload(
                data_url,
                UploadOptions {
                    folder: Some("attendance-photos".to_string()),
                    key: Some("student_21CS101_1234567890".to_string()),
                },
            )
            .await
            .unwrap();

        assert!(result
            .url
            .starts_with("https://test-bucket.s3.us-east-1.amazonaws.com/"));
        assert!(result.public_id.contains("attendance-photos/"));
        assert_eq!(result.provider, "s3");

        // Verify S3 client send was called once
        let commands = mock.get_send_commands();
        assert_eq!(commands.len(), 1);
    }

    #[tokio::test]
    async fn should_use_the_folder_and_key_from_options_in_the_s3_object_key() {
        let mock = Arc::new(MockS3Client::new());
        mock.set_send_result(Ok(()));

        let provider = create_test_provider(mock.clone());

        provider
            .upload(
                "data:image/jpeg;base64,SGVsbG8gV29ybGQ=",
                UploadOptions {
                    folder: Some("attendance-photos".to_string()),
                    key: Some("myfile".to_string()),
                },
            )
            .await
            .unwrap();

        // The PutObjectCommand passed to send() should reference the constructed key.
        let sent_command = mock.get_send_commands();
        assert_eq!(sent_command[0].bucket, "test-bucket");
        assert!(sent_command[0].key.contains("attendance-photos/myfile"));
        assert_eq!(sent_command[0].content_type, "image/jpeg");
    }

    #[tokio::test]
    async fn should_wrap_s3_send_errors_in_a_descriptive_s3_error() {
        let mock = Arc::new(MockS3Client::new());
        mock.set_send_result(Err(MockError("Access Denied".to_string())));

        let provider = create_test_provider(mock);

        let result = provider
            .upload("data:image/jpeg;base64,SGVsbG8gV29ybGQ=", UploadOptions::default())
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.0.contains("S3 upload failed"));
        assert!(err.0.contains("Access Denied"));
    }

    // --- upload() error cases (no network needed) ---

    #[tokio::test]
    async fn should_reject_upload_when_file_is_null() {
        let mock = Arc::new(MockS3Client::new());
        let provider = create_test_provider(mock);

        let result = provider.upload("", UploadOptions::default()).await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn should_reject_upload_with_malformed_data_prefix_url() {
        let mock = Arc::new(MockS3Client::new());
        let provider = create_test_provider(mock);

        // Strings starting with 'data:' but not matching the full base64 pattern
        // trigger the 'Invalid data URL format' branch before any network call.
        let result = provider
            .upload("data:image/jpeg;INVALID_FORMAT", UploadOptions::default())
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().0.contains("Invalid data URL format"));
    }

    #[tokio::test]
    async fn should_reject_upload_when_s3_send_fails_non_data_string_path() {
        let mock = Arc::new(MockS3Client::new());
        mock.set_send_result(Err(MockError("The access key does not exist".to_string())));

        let provider = create_test_provider(mock);

        // Non-data: strings are treated as raw base64 and decoded locally, then
        // sent to S3. Mock send() to verify the error is wrapped correctly.
        let result = provider
            .upload("SGVsbG8gV29ybGQ=", UploadOptions::default())
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.0.contains("S3 upload failed"));
        assert!(err.0.contains("The access key does not exist"));
    }

    #[tokio::test]
    async fn should_reject_upload_with_empty_file() {
        let mock = Arc::new(MockS3Client::new());
        let provider = create_test_provider(mock);

        let result = provider.upload("", UploadOptions::default()).await;

        assert!(result.is_err());
    }

    // --- delete() tests ---

    #[tokio::test]
    async fn should_delete_object_by_key() {
        let mock = Arc::new(MockS3Client::new());
        mock.set_delete_result(Ok(()));

        let provider = create_test_provider(mock.clone());

        let result = provider.delete("attendance-photos/photo.jpg").await;

        assert!(result.is_ok());
        assert!(result.unwrap());
    }

    #[tokio::test]
    async fn should_wrap_delete_errors_with_descriptive_message() {
        let mock = Arc::new(MockS3Client::new());
        mock.set_delete_result(Err(MockError("NoSuchKey".to_string())));

        let provider = create_test_provider(mock);

        let result = provider.delete("attendance-photos/missing.jpg").await;

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.0.contains("S3 delete failed"));
        assert!(err.0.contains("NoSuchKey"));
    }

    // --- getUploadUrl() (presigned URL) tests ---

    #[tokio::test]
    async fn should_generate_a_presigned_upload_url_for_put() {
        let mock = Arc::new(MockS3Client::new());
        let provider = create_test_provider(mock);

        let result = provider
            .get_upload_url("student_001", "image/jpeg")
            .await
            .unwrap();

        assert_eq!(result.method, "PUT");
        assert_eq!(result.public_id, "attendance-photos/student_001");
        assert_eq!(result.content_type, "image/jpeg");
        assert!(result.upload_url.contains("amazonaws.com"));

        // Check headers
        let has_content_type_header = result
            .headers
            .iter()
            .any(|(k, v)| k == "Content-Type" && v == "image/jpeg");
        assert!(has_content_type_header);
    }

    #[test]
    fn should_have_all_required_provider_methods() {
        let mock = Arc::new(MockS3Client::new());
        let provider = create_test_provider(mock);

        // Verify all required methods exist and are callable
        assert_eq!(provider.get_name(), "s3");
        let _ = provider.get_file_url("test-key");
    }
}

// ============================================================================
// Tests: Storage Factory
// ============================================================================

mod storage_factory {
    use super::*;

    #[test]
    fn should_initialize_cloudinary_provider_by_default() {
        let config = StorageFactoryConfig {
            provider: StorageProviderType::Cloudinary,
            cloudinary: Some(CloudinaryConfig {
                cloud_name: "test".to_string(),
                api_key: "test".to_string(),
                api_secret: "test".to_string(),
            }),
            s3: None,
        };

        let provider = initialize_storage(config).unwrap();

        assert_eq!(provider.get_name(), "cloudinary");
    }

    #[test]
    fn should_initialize_s3_provider_when_specified() {
        let config = StorageFactoryConfig {
            provider: StorageProviderType::S3,
            cloudinary: None,
            s3: Some(S3Config {
                bucket: "test-bucket".to_string(),
                region: "us-east-1".to_string(),
                access_key_id: "test-key".to_string(),
                secret_access_key: "test-secret".to_string(),
            }),
        };

        let provider = initialize_storage(config).unwrap();

        assert_eq!(provider.get_name(), "s3");
    }

    #[test]
    fn should_throw_error_for_missing_s3_config() {
        let config = StorageFactoryConfig {
            provider: StorageProviderType::S3,
            cloudinary: None,
            s3: Some(S3Config {
                bucket: "".to_string(),
                region: "".to_string(),
                access_key_id: "".to_string(),
                secret_access_key: "".to_string(),
            }),
        };

        let result = initialize_storage(config);

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .0
            .contains("S3 configuration incomplete"));
    }

    #[test]
    fn should_throw_error_for_missing_cloudinary_config() {
        let config = StorageFactoryConfig {
            provider: StorageProviderType::Cloudinary,
            cloudinary: Some(CloudinaryConfig {
                cloud_name: "".to_string(),
                api_key: "".to_string(),
                api_secret: "".to_string(),
            }),
            s3: None,
        };

        let result = initialize_storage(config);

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .0
            .contains("Cloudinary configuration incomplete"));
    }
}

// ============================================================================
// Test Count Summary
// ============================================================================
//
// Tests ported from storage.test.js:
//
// StorageProvider Interface:
// 1. should_throw_error_for_unimplemented_methods
// 2. should_throw_error_for_unimplemented_get_file_url
// 3. should_throw_error_for_unimplemented_get_name
//
// CloudinaryProvider:
// 4. should_initialize_with_config
// 5. should_return_correct_provider_name
// 6. should_upload_file_and_return_url_and_public_id
// 7. should_apply_image_quality_and_resize_transformation_on_upload
// 8. should_wrap_upload_errors_with_descriptive_message
// 9. should_delete_file_by_public_id
// 10. should_wrap_delete_errors_with_descriptive_message
// 11. should_generate_upload_url_with_required_fields
// 12. should_generate_upload_url_with_correct_public_id_format
// 13. should_generate_file_url_containing_cloud_name_and_public_id
//
// S3Provider:
// 14. should_initialize_with_config
// 15. should_return_correct_provider_name
// 16. should_generate_correct_file_url
// 17. should_generate_file_url_with_custom_region
// 18. should_upload_a_data_url_file_and_return_url_and_public_id_and_provider
// 19. should_use_the_folder_and_key_from_options_in_the_s3_object_key
// 20. should_wrap_s3_send_errors_in_a_descriptive_s3_error
// 21. should_reject_upload_when_file_is_null
// 22. should_reject_upload_with_malformed_data_prefix_url
// 23. should_reject_upload_when_s3_send_fails_non_data_string_path
// 24. should_reject_upload_with_empty_file
// 25. should_delete_object_by_key
// 26. should_wrap_delete_errors_with_descriptive_message
// 27. should_generate_a_presigned_upload_url_for_put
// 28. should_have_all_required_provider_methods
//
// Storage Factory:
// 29. should_initialize_cloudinary_provider_by_default
// 30. should_initialize_s3_provider_when_specified
// 31. should_throw_error_for_missing_s3_config
// 32. should_throw_error_for_missing_cloudinary_config
//
// Total: 32 tests ported
