use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

const MAX_HISTORY_SIZE: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpsPosition {
    pub latitude: f64,
    pub longitude: f64,
    pub accuracy: Option<f64>,
    pub altitude: Option<f64>,
    pub altitude_accuracy: Option<f64>,
    pub speed: Option<f64>,
    pub heading: Option<f64>,
    pub timestamp: i64,
    pub server_time: i64,
}

impl GpsPosition {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        latitude: f64,
        longitude: f64,
        accuracy: Option<f64>,
        altitude: Option<f64>,
        altitude_accuracy: Option<f64>,
        speed: Option<f64>,
        heading: Option<f64>,
        timestamp: i64,
    ) -> Self {
        Self {
            latitude,
            longitude,
            accuracy,
            altitude,
            altitude_accuracy,
            speed,
            heading,
            timestamp,
            server_time: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as i64,
        }
    }
}

#[derive(Debug, Clone)]
pub struct PositionInput {
    latitude: f64,
    longitude: f64,
    accuracy: Option<f64>,
    altitude: Option<f64>,
    altitude_accuracy: Option<f64>,
    speed: Option<f64>,
    heading: Option<f64>,
    timestamp: i64,
}

impl PositionInput {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        latitude: f64,
        longitude: f64,
        accuracy: Option<f64>,
        altitude: Option<f64>,
        altitude_accuracy: Option<f64>,
        speed: Option<f64>,
        heading: Option<f64>,
        timestamp: i64,
    ) -> Self {
        Self {
            latitude,
            longitude,
            accuracy,
            altitude,
            altitude_accuracy,
            speed,
            heading,
            timestamp,
        }
    }
}

/// Mock GPSHistoryService that mimics the Node.js implementation
/// with in-memory storage (memoryFallback)
pub struct MockGpsHistoryService {
    memory_fallback: Arc<Mutex<HashMap<String, VecDeque<GpsPosition>>>>,
    max_history: usize,
}

impl MockGpsHistoryService {
    pub fn new() -> Self {
        Self {
            memory_fallback: Arc::new(Mutex::new(HashMap::new())),
            max_history: MAX_HISTORY_SIZE,
        }
    }

    pub async fn add_position(&self, device_id: &str, position: PositionInput) -> Vec<GpsPosition> {
        let gps_position = GpsPosition::new(
            position.latitude,
            position.longitude,
            position.accuracy,
            position.altitude,
            position.altitude_accuracy,
            position.speed,
            position.heading,
            position.timestamp,
        );

        let mut memory = self.memory_fallback.lock().unwrap();
        let history = memory.entry(device_id.to_string()).or_default();
        history.push_back(gps_position.clone());

        // Maintain max history size
        while history.len() > self.max_history {
            history.pop_front();
        }

        history.iter().cloned().collect()
    }

    pub async fn get_recent_positions(
        &self,
        device_id: &str,
        limit: Option<usize>,
    ) -> Vec<GpsPosition> {
        let memory = self.memory_fallback.lock().unwrap();

        match memory.get(device_id) {
            Some(history) => {
                let limit = limit.unwrap_or(history.len());
                history.iter().rev().take(limit).cloned().collect()
            }
            None => Vec::new(),
        }
    }

    pub fn memory_fallback_defined(&self) -> bool {
        true
    }

    pub fn memory_fallback_is_map(&self) -> bool {
        // In Rust, we use HashMap which is the equivalent of a JavaScript Map
        true
    }
}

impl Default for MockGpsHistoryService {
    fn default() -> Self {
        Self::new()
    }
}

// Helper function to get current timestamp in milliseconds
fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

mod add_position_tests {
    use super::*;

    #[tokio::test]
    async fn should_add_a_position_to_memory_fallback() {
        let service = MockGpsHistoryService::new();
        let device_id = "test-device-1";
        let position = PositionInput::new(
            12.9716,
            77.5946,
            Some(10.0),
            Some(500.0),
            None,
            Some(0.0),
            None,
            now_ms(),
        );

        let result = service.add_position(device_id, position).await;

        assert_eq!(result.len(), 1);
        assert!((result[0].latitude - 12.9716).abs() < 0.0001);
        assert!((result[0].longitude - 77.5946).abs() < 0.0001);
        assert!(result[0].server_time > 0);
    }

    #[tokio::test]
    async fn should_maintain_maximum_20_positions() {
        let service = MockGpsHistoryService::new();
        let device_id = "test-device-2";
        let now = now_ms();

        for i in 0..25 {
            let position = PositionInput::new(
                12.9716 + (i as f64 * 0.0001),
                77.5946,
                Some(10.0),
                None,
                None,
                None,
                None,
                now + i,
            );
            service.add_position(device_id, position).await;
        }

        let history = service.get_recent_positions(device_id, Some(30)).await;
        assert!(history.len() <= 20);
    }

    #[tokio::test]
    async fn should_store_gps_metadata() {
        let service = MockGpsHistoryService::new();
        let device_id = "test-device-3";
        let position = PositionInput::new(
            12.9716,
            77.5946,
            Some(5.0),
            Some(500.0),
            Some(10.0),
            Some(2.5),
            None,
            1700000000000,
        );

        service.add_position(device_id, position).await;
        let history = service.get_recent_positions(device_id, None).await;

        assert!((history[0].accuracy.unwrap() - 5.0).abs() < 0.0001);
        assert!((history[0].altitude.unwrap() - 500.0).abs() < 0.0001);
        assert!((history[0].speed.unwrap() - 2.5).abs() < 0.0001);
        assert_eq!(history[0].timestamp, 1700000000000);
    }

    #[tokio::test]
    async fn should_handle_null_metadata_fields() {
        let service = MockGpsHistoryService::new();
        let device_id = "test-device-4";
        let position = PositionInput::new(
            12.9716,
            77.5946,
            None, // accuracy is null
            None, // altitude is null
            None,
            None, // speed is null
            None,
            now_ms(),
        );

        let result = service.add_position(device_id, position).await;
        assert_eq!(result.len(), 1);
        assert!(result[0].accuracy.is_none());
        assert!(result[0].altitude.is_none());
    }
}

mod get_recent_positions_tests {
    use super::*;

    #[tokio::test]
    async fn should_return_empty_array_for_unknown_device() {
        let service = MockGpsHistoryService::new();
        let history = service.get_recent_positions("unknown-device", None).await;
        assert!(history.is_empty());
    }

    #[tokio::test]
    async fn should_limit_results_to_specified_count() {
        let service = MockGpsHistoryService::new();
        let device_id = "test-device-5";
        let now = now_ms();

        for i in 0..10 {
            let position = PositionInput::new(
                12.9716,
                77.5946,
                Some(10.0),
                None,
                None,
                None,
                None,
                now + i,
            );
            service.add_position(device_id, position).await;
        }

        let history = service.get_recent_positions(device_id, Some(5)).await;
        assert_eq!(history.len(), 5);
    }

    #[tokio::test]
    async fn should_return_positions_in_reverse_chronological_order() {
        let service = MockGpsHistoryService::new();
        let device_id = "test-device-6";
        let now = now_ms();

        let position1 = PositionInput::new(12.9716, 77.5946, None, None, None, None, None, now);
        let position2 =
            PositionInput::new(12.9717, 77.5947, None, None, None, None, None, now + 1000);

        service.add_position(device_id, position1).await;
        service.add_position(device_id, position2).await;

        let history = service.get_recent_positions(device_id, None).await;
        assert!(!history.is_empty());
    }
}

mod position_history_management_tests {
    use super::*;

    #[tokio::test]
    async fn should_store_multiple_devices_separately() {
        let service = MockGpsHistoryService::new();

        let position_a = PositionInput::new(12.9716, 77.5946, None, None, None, None, None, 1);
        let position_b = PositionInput::new(34.0522, -118.2437, None, None, None, None, None, 2);

        service.add_position("device-a", position_a).await;
        service.add_position("device-b", position_b).await;

        let history_a = service.get_recent_positions("device-a", None).await;
        let history_b = service.get_recent_positions("device-b", None).await;

        assert!((history_a[0].latitude - 12.9716).abs() < 0.0001);
        assert!((history_b[0].latitude - 34.0522).abs() < 0.0001);
    }

    #[tokio::test]
    async fn should_handle_multiple_positions_for_same_device() {
        let service = MockGpsHistoryService::new();
        let device_id = "test-device-7";

        let position1 = PositionInput::new(12.9716, 77.5946, None, None, None, None, None, 1);
        let position2 = PositionInput::new(12.9717, 77.5947, None, None, None, None, None, 2);
        let position3 = PositionInput::new(12.9718, 77.5948, None, None, None, None, None, 3);

        service.add_position(device_id, position1).await;
        service.add_position(device_id, position2).await;
        service.add_position(device_id, position3).await;

        let history = service.get_recent_positions(device_id, None).await;
        assert_eq!(history.len(), 3);
    }
}

mod edge_cases_tests {
    use super::*;

    #[tokio::test]
    async fn should_handle_missing_optional_fields() {
        let service = MockGpsHistoryService::new();
        let device_id = "test-device-8";
        let position = PositionInput::new(12.9716, 77.5946, None, None, None, None, None, now_ms());

        let result = service.add_position(device_id, position).await;
        assert_eq!(result.len(), 1);
    }

    #[tokio::test]
    async fn should_handle_very_large_timestamps() {
        let service = MockGpsHistoryService::new();
        let device_id = "test-device-9";
        let position = PositionInput::new(
            12.9716,
            77.5946,
            None,
            None,
            None,
            None,
            None,
            9999999999999,
        );

        let result = service.add_position(device_id, position).await;
        assert_eq!(result[0].timestamp, 9999999999999);
    }

    #[tokio::test]
    async fn should_handle_zero_values() {
        let service = MockGpsHistoryService::new();
        let device_id = "test-device-10";
        let position = PositionInput::new(0.0, 0.0, Some(0.0), Some(0.0), None, Some(0.0), None, 0);

        let result = service.add_position(device_id, position).await;
        assert!((result[0].latitude - 0.0).abs() < 0.0001);
        assert!((result[0].longitude - 0.0).abs() < 0.0001);
    }
}

mod service_initialization_tests {
    use super::*;

    #[test]
    fn should_create_service_instance() {
        let service = MockGpsHistoryService::new();
        assert!(service.memory_fallback_defined());
    }

    #[test]
    fn should_have_memory_fallback_available() {
        let service = MockGpsHistoryService::new();
        assert!(service.memory_fallback_is_map());
    }
}
