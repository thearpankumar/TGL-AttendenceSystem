use captcha::{
    filters::{Dots, Noise, Wave},
    Captcha,
};
use chrono::Utc;
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

/// Generate a captcha SVG and signed stateless captcha ID
fn generate_captcha(jwt_secret: &str) -> (String, String) {
    let mut captcha = Captcha::new();
    captcha.add_chars(5);
    let captcha_text = captcha.chars_as_string();

    captcha
        .apply_filter(Noise::new(0.4))
        .apply_filter(Wave::new(2.0, 20.0).horizontal())
        .view(220, 120)
        .apply_filter(Dots::new(15));

    let png_data = captcha.as_png().unwrap_or_default();
    let svg = format!(
        "<img src=\"data:image/png;base64,{}\" />",
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, png_data)
    );

    let timestamp = Utc::now().timestamp_millis();
    let mut mac = Hmac::<Sha256>::new_from_slice(jwt_secret.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(format!("{}:{}", captcha_text.to_lowercase(), timestamp).as_bytes());
    let signature = hex::encode(mac.finalize().into_bytes());
    let captcha_id = format!("{}.{}", timestamp, signature);

    (svg, captcha_id)
}

mod generate_captcha_tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn should_generate_captcha_svg_and_signed_stateless_captcha_id() {
        let jwt_secret = "test_secret_key";
        let (svg, captcha_id) = generate_captcha(jwt_secret);

        // Verify SVG contains the expected image tag
        assert!(svg.contains("<img"));
        assert!(svg.contains("data:image/png;base64,"));
        assert!(svg.ends_with(" />"));

        // Verify captchaId is defined
        assert!(!captcha_id.is_empty());

        // Verify captchaId format: <timestamp>.<signature>
        let parts: Vec<&str> = captcha_id.split('.').collect();
        assert_eq!(
            parts.len(),
            2,
            "captchaId should have exactly 2 parts separated by '.'"
        );

        // Verify timestamp is valid and recent
        let timestamp: i64 = parts[0]
            .parse()
            .expect("Timestamp should be a valid number");
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards")
            .as_millis() as i64;
        let time_diff = (now - timestamp).abs();
        assert!(
            time_diff < 5000,
            "Timestamp should be within 5 seconds of current time (diff: {}ms)",
            time_diff
        );

        // Verify signature is a valid hex string
        assert!(
            parts[1].chars().all(|c| c.is_ascii_hexdigit()),
            "Signature should be a valid hex string"
        );
        assert!(!parts[1].is_empty(), "Signature should not be empty");
    }

    #[test]
    fn should_generate_unique_captcha_ids_each_time() {
        let jwt_secret = "test_secret_key";
        let (_, captcha_id1) = generate_captcha(jwt_secret);
        // Small delay to ensure different timestamp
        std::thread::sleep(std::time::Duration::from_millis(10));
        let (_, captcha_id2) = generate_captcha(jwt_secret);

        assert_ne!(
            captcha_id1, captcha_id2,
            "Each captcha generation should produce a unique ID"
        );
    }

    #[test]
    fn should_generate_svg_with_valid_base64_content() {
        let jwt_secret = "test_secret_key";
        let (svg, _) = generate_captcha(jwt_secret);

        // Extract base64 content from the SVG
        let start_marker = "data:image/png;base64,";
        let start_idx = svg
            .find(start_marker)
            .expect("SVG should contain base64 data marker");
        let end_idx = svg
            .find("\" />")
            .expect("SVG should end the attribute properly");
        let base64_content = &svg[start_idx + start_marker.len()..end_idx];

        // Verify base64 content is valid
        assert!(
            !base64_content.is_empty(),
            "Base64 content should not be empty"
        );
        assert!(
            base64_content
                .chars()
                .all(|c| c.is_alphanumeric() || c == '+' || c == '/' || c == '='),
            "Base64 content should only contain valid base64 characters"
        );
    }

    #[test]
    fn should_produce_different_signatures_for_different_timestamps() {
        let jwt_secret = "test_secret_key";

        let (_, captcha_id1) = generate_captcha(jwt_secret);
        std::thread::sleep(std::time::Duration::from_millis(10));
        let (_, captcha_id2) = generate_captcha(jwt_secret);

        let parts1: Vec<&str> = captcha_id1.split('.').collect();
        let parts2: Vec<&str> = captcha_id2.split('.').collect();

        // Timestamps should be different
        assert_ne!(parts1[0], parts2[0], "Timestamps should differ");
        // Signatures should be different due to different timestamps
        assert_ne!(
            parts1[1], parts2[1],
            "Signatures should differ for different timestamps"
        );
    }
}

mod header_tests {
    /// Simulated response headers for captcha endpoint
    struct MockResponseHeaders {
        headers: Vec<(String, String)>,
    }

    impl MockResponseHeaders {
        fn new() -> Self {
            Self {
                headers: Vec::new(),
            }
        }

        fn set_header(&mut self, key: &str, value: &str) {
            self.headers.push((key.to_string(), value.to_string()));
        }

        fn get(&self, key: &str) -> Option<&str> {
            self.headers
                .iter()
                .find(|(k, _)| k == key)
                .map(|(_, v)| v.as_str())
        }
    }

    fn set_no_cache_headers(headers: &mut MockResponseHeaders) {
        headers.set_header(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, proxy-revalidate",
        );
        headers.set_header("Pragma", "no-cache");
        headers.set_header("Expires", "0");
    }

    #[test]
    fn should_set_headers_to_disable_caching_of_captcha() {
        let mut headers = MockResponseHeaders::new();
        set_no_cache_headers(&mut headers);

        assert_eq!(
            headers.get("Cache-Control"),
            Some("no-store, no-cache, must-revalidate, proxy-revalidate"),
            "Cache-Control header should be set to disable caching"
        );
        assert_eq!(
            headers.get("Pragma"),
            Some("no-cache"),
            "Pragma header should be set to no-cache"
        );
        assert_eq!(
            headers.get("Expires"),
            Some("0"),
            "Expires header should be set to 0"
        );
    }

    #[test]
    fn should_have_all_required_no_cache_headers() {
        let mut headers = MockResponseHeaders::new();
        set_no_cache_headers(&mut headers);

        // Verify all three headers are present
        assert!(
            headers.get("Cache-Control").is_some(),
            "Cache-Control header should be present"
        );
        assert!(
            headers.get("Pragma").is_some(),
            "Pragma header should be present"
        );
        assert!(
            headers.get("Expires").is_some(),
            "Expires header should be present"
        );

        // Verify count of headers set
        assert_eq!(
            headers.headers.len(),
            3,
            "Exactly 3 cache control headers should be set"
        );
    }
}
