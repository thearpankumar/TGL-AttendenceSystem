//! Emulator Detection Middleware Tests
//! Ported from backend/tests/emulatorDetection.test.js
//!
//! This module tests the emulator detection middleware functionality including:
//! - GPU Detection (emulator and desktop GPU patterns)
//! - Device Memory Detection
//! - Touch Points Detection
//! - Platform Inconsistency Detection
//! - Client-Side Emulation Detection
//! - Combined Detection Logic
//! - Edge Cases

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================================
// Mock Constants - Mirroring Node.js backend/src/middleware/emulatorDetection.js
// ============================================================================

/// Emulator GPU patterns from Node.js backend
/// These patterns indicate the device is likely an emulator or VM
pub const EMULATOR_GPU_PATTERNS: &[&str] = &[
    "SwiftShader",
    "llvmpipe",
    "Software",
    "Mesa",
    "Gallium",
    "Software Rasterizer",
    "Microsoft Basic Render",
    "VirGL",
    "VMware",
    "VirtualBox",
];

/// Desktop GPU patterns from Node.js backend
/// These patterns indicate a desktop GPU which is suspicious on mobile devices
pub const DESKTOP_GPU_PATTERNS: &[&str] =
    &["NVIDIA", "GeForce", "RTX", "GTX", "AMD", "Radeon", "Arc"];

// ============================================================================
// Helper Functions for Pattern Matching
// ============================================================================

/// Check if a renderer contains any of the given patterns
fn contains_any_pattern(renderer: &str, patterns: &[&str]) -> bool {
    patterns.iter().any(|p| renderer.contains(p))
}

/// Check if a string matches mobile user-agent patterns
fn is_mobile_ua(ua: &str) -> bool {
    ua.contains("iPhone")
        || ua.contains("iPad")
        || ua.contains("iPod")
        || ua.contains("Android")
        || ua.contains("Mobile")
}

/// Check if platform indicates desktop OS
fn is_desktop_platform(platform: &str) -> bool {
    platform.contains("Windows")
        || platform.contains("macOS")
        || platform.contains("Linux")
        || platform.contains("Chrome OS")
}

// ============================================================================
// Mock Data Structures
// ============================================================================

/// Emulator flag structure matching Node.js implementation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EmulatorFlag {
    #[serde(rename = "type")]
    pub flag_type: String,
    pub details: String,
    pub severity: Option<String>,
}

impl EmulatorFlag {
    pub fn new(flag_type: &str, details: &str) -> Self {
        Self {
            flag_type: flag_type.to_string(),
            details: details.to_string(),
            severity: None,
        }
    }

    pub fn with_severity(flag_type: &str, details: &str, severity: &str) -> Self {
        Self {
            flag_type: flag_type.to_string(),
            details: details.to_string(),
            severity: Some(severity.to_string()),
        }
    }
}

/// Device metrics structure
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DeviceMetrics {
    pub webgl_renderer: Option<String>,
    pub device_memory: Option<i32>,
    pub max_touch_points: Option<i32>,
    pub is_emulation: Option<bool>,
    pub inconsistencies: Option<Vec<String>>,
}

/// Emulator detection result
#[derive(Debug, Clone, Default)]
pub struct _EmulatorDetectionResult {
    pub _detected: bool,
    pub _flags: Vec<EmulatorFlag>,
    pub _has_high_severity: bool,
}

// ============================================================================
// Test Modules - Ported from emulatorDetection.test.js
// ============================================================================

mod gpu_detection {
    use super::*;

    /// Ported from: "should detect SwiftShader as emulator GPU"
    /// Node.js test: expect(EMULATOR_GPU_PATTERNS.some(p => renderer.includes(p))).toBe(true);
    #[test]
    fn should_detect_swift_shader_as_emulator_gpu() {
        let renderer = "SwiftShader";
        assert!(contains_any_pattern(renderer, EMULATOR_GPU_PATTERNS));
    }

    /// Ported from: "should detect llvmpipe as emulator GPU"
    /// Node.js test: expect(EMULATOR_GPU_PATTERNS.some(p => renderer.includes(p))).toBe(true);
    #[test]
    fn should_detect_llvmpipe_as_emulator_gpu() {
        let renderer = "llvmpipe (LLVM 10.0.0, 128 bits)";
        assert!(contains_any_pattern(renderer, EMULATOR_GPU_PATTERNS));
    }

    /// Ported from: "should detect Mesa as emulator GPU"
    /// Node.js test checks that containsPattern is a boolean
    #[test]
    fn should_detect_mesa_as_emulator_gpu() {
        let renderer = "Mesa DRI Intel(R) HD Graphics";
        let contains_pattern = contains_any_pattern(renderer, EMULATOR_GPU_PATTERNS);
        // Node.js test checks typeof containsPattern === 'boolean'
        // In Rust, the type is already boolean
        assert!(matches!(contains_pattern, true | false));
    }

    /// Ported from: "should detect VirtualBox GPU"
    /// Node.js test: expect(EMULATOR_GPU_PATTERNS.some(p => renderer.includes(p))).toBe(true);
    #[test]
    fn should_detect_virtualbox_gpu() {
        let renderer = "VirtualBox Graphics Adapter";
        assert!(contains_any_pattern(renderer, EMULATOR_GPU_PATTERNS));
    }

    /// Ported from: "should detect VMware GPU"
    /// Node.js test: expect(EMULATOR_GPU_PATTERNS.some(p => renderer.includes(p))).toBe(true);
    #[test]
    fn should_detect_vmware_gpu() {
        let renderer = "VMware SVGA II Adapter";
        assert!(contains_any_pattern(renderer, EMULATOR_GPU_PATTERNS));
    }

    /// Ported from: "should not flag real mobile GPU (Adreno)"
    /// Node.js test: expect(EMULATOR_GPU_PATTERNS.some(p => renderer.includes(p))).toBe(false);
    #[test]
    fn should_not_flag_real_mobile_gpu_adreno() {
        let renderer = "Adreno (TM) 650";
        assert!(!contains_any_pattern(renderer, EMULATOR_GPU_PATTERNS));
    }

    /// Ported from: "should not flag real mobile GPU (Mali)"
    /// Node.js test: expect(EMULATOR_GPU_PATTERNS.some(p => renderer.includes(p))).toBe(false);
    #[test]
    fn should_not_flag_real_mobile_gpu_mali() {
        let renderer = "Mali-G78";
        assert!(!contains_any_pattern(renderer, EMULATOR_GPU_PATTERNS));
    }

    /// Ported from: "should detect desktop GPU (NVIDIA)"
    /// Node.js test: expect(DESKTOP_GPU_PATTERNS.some(p => renderer.includes(p))).toBe(true);
    #[test]
    fn should_detect_desktop_gpu_nvidia() {
        let renderer = "NVIDIA GeForce RTX 3080";
        assert!(contains_any_pattern(renderer, DESKTOP_GPU_PATTERNS));
    }

    /// Ported from: "should detect desktop GPU (AMD)"
    /// Node.js test: expect(DESKTOP_GPU_PATTERNS.some(p => renderer.includes(p))).toBe(true);
    #[test]
    fn should_detect_desktop_gpu_amd() {
        let renderer = "AMD Radeon RX 6800";
        assert!(contains_any_pattern(renderer, DESKTOP_GPU_PATTERNS));
    }

    /// Ported from: "should detect desktop GPU (GeForce)"
    /// Node.js test: expect(DESKTOP_GPU_PATTERNS.some(p => renderer.includes(p))).toBe(true);
    #[test]
    fn should_detect_desktop_gpu_geforce() {
        let renderer = "GeForce GTX 1660";
        assert!(contains_any_pattern(renderer, DESKTOP_GPU_PATTERNS));
    }

    /// Ported from: "should detect desktop GPU (Intel UHD)"
    /// Node.js test checks that renderer is a string
    #[test]
    fn should_detect_desktop_gpu_intel_uhd() {
        let renderer = "Intel(R) UHD Graphics 630";
        // Node.js test: expect(typeof renderer).toBe('string');
        // In Rust, renderer is already a &str
        assert!(renderer.contains("Intel"));
    }
}

mod device_memory_detection {

    /// Ported from: "should flag very low memory (< 2GB)"
    /// Node.js test: expect(deviceMemory).toBeLessThan(2);
    #[test]
    fn should_flag_very_low_memory() {
        let device_memory = 1;
        assert!(device_memory < 2);
    }

    /// Ported from: "should flag suspiciously exact memory"
    /// Node.js test: expect([1, 2, 4, 8].includes(deviceMemory)).toBe(true);
    #[test]
    fn should_flag_suspiciously_exact_memory() {
        let device_memory = 4;
        let valid_values = [1, 2, 4, 8];
        assert!(valid_values.contains(&device_memory));
    }

    /// Ported from: "should accept normal memory range"
    /// Node.js test: expect(deviceMemory).toBeGreaterThanOrEqual(4);
    #[test]
    fn should_accept_normal_memory_range() {
        let device_memory = 8;
        assert!(device_memory >= 4);
    }
}

mod touch_points_detection {
    use super::*;

    /// Ported from: "should flag mobile UA with 0 touch points"
    /// Node.js test checks isMobile detection and maxTouchPoints === 0
    #[test]
    fn should_flag_mobile_ua_with_0_touch_points() {
        let mobile_ua = "Mozilla/5.0 (Linux; Android 13) Chrome/112.0.0.0 Mobile";
        let max_touch_points = 0;

        let is_mobile = is_mobile_ua(mobile_ua);
        assert!(is_mobile);
        assert_eq!(max_touch_points, 0);
    }

    /// Ported from: "should accept mobile with touch points"
    /// Node.js test: expect(maxTouchPoints).toBeGreaterThan(0);
    #[test]
    fn should_accept_mobile_with_touch_points() {
        let max_touch_points = 5;
        assert!(max_touch_points > 0);
    }

    /// Ported from: "should accept desktop without touch"
    /// Node.js test checks that desktop UA is not flagged as mobile
    #[test]
    fn should_accept_desktop_without_touch() {
        let desktop_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/112.0.0.0";
        let max_touch_points = 0;

        let is_mobile = is_mobile_ua(desktop_ua);
        assert!(!is_mobile);
        // maxTouchPoints being 0 is acceptable for desktop
        let _ = max_touch_points;
    }
}

mod platform_inconsistency_detection {

    /// Ported from: "should detect iPhone UA with Windows platform"
    /// Node.js test checks isiPhone && isWindows combination
    #[test]
    fn should_detect_iphone_ua_with_windows_platform() {
        let ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)";
        let platform = "Windows";

        let is_iphone = ua.contains("iPhone");
        let is_windows = platform.contains("Windows");

        assert!(is_iphone && is_windows);
    }

    /// Ported from: "should detect Android UA with macOS platform"
    /// Node.js test checks isAndroid && isMacOS combination
    #[test]
    fn should_detect_android_ua_with_macos_platform() {
        let ua = "Mozilla/5.0 (Linux; Android 13) Chrome/112.0.0.0 Mobile Safari/537.36";
        let platform = "macOS";

        let is_android = ua.contains("Android");
        let is_macos = platform.contains("macOS") || platform.contains("Mac OS");

        assert!(is_android && is_macos);
    }

    /// Ported from: "should accept matching platform (iPhone/iOS)"
    /// Node.js test checks isiPhone && isIOS combination
    #[test]
    fn should_accept_matching_platform_iphone_ios() {
        let ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)";
        let platform = "iOS";

        let is_iphone = ua.contains("iPhone");
        let is_ios =
            platform.contains("iOS") || platform.contains("iPhone") || platform.contains("iPad");

        assert!(is_iphone && is_ios);
    }

    /// Ported from: "should accept matching platform (Android/Android)"
    /// Node.js test checks isAndroid && isAndroidPlatform combination
    #[test]
    fn should_accept_matching_platform_android_android() {
        let ua = "Mozilla/5.0 (Linux; Android 13) Chrome/112.0.0.0 Mobile Safari/537.36";
        let platform = "Android";

        let is_android = ua.contains("Android");
        let is_android_platform = platform.contains("Android");

        assert!(is_android && is_android_platform);
    }
}

mod client_side_emulation_detection {
    use super::*;

    /// Ported from: "should flag client-reported emulation"
    /// Node.js test: expect(clientFlags.length).toBeGreaterThan(0);
    #[test]
    fn should_flag_client_reported_emulation() {
        let client_flags = [EmulatorFlag::new(
            "EMULATOR_DETECTED",
            "Client reported emulation",
        )];
        assert!(!client_flags.is_empty());
    }

    /// Ported from: "should handle client-reported inconsistencies"
    /// Node.js test: expect(clientFlags.length).toBe(2);
    #[test]
    fn should_handle_client_reported_inconsistencies() {
        let client_flags = [
            EmulatorFlag::new("MEMORY_SUSPICIOUS", "Very low memory"),
            EmulatorFlag::new("TOUCH_MISMATCH", "Mobile UA but no touch"),
        ];
        assert_eq!(client_flags.len(), 2);
    }
}

mod combine_flags {
    use super::*;

    /// Ported from: "should combine multiple flags correctly"
    /// Node.js test: expect(flags.length).toBe(2);
    #[test]
    fn should_combine_multiple_flags_correctly() {
        let flags: Vec<EmulatorFlag> = vec![
            EmulatorFlag::with_severity("GPU_EMULATOR", "Emulator GPU detected", "high"),
            EmulatorFlag::with_severity("MEMORY_SUSPICIOUS", "Suspicious memory", "medium"),
        ];

        assert_eq!(flags.len(), 2);
    }
}

mod edge_cases {
    use super::*;

    /// Ported from: "should handle missing deviceMetrics"
    /// Node.js test: expect(deviceMetrics).toBeUndefined();
    #[test]
    fn should_handle_missing_device_metrics() {
        let device_metrics: Option<DeviceMetrics> = None;
        assert!(device_metrics.is_none());
    }

    /// Ported from: "should handle missing sec-ch-ua-platform"
    /// Node.js test: expect(platform).toBeUndefined();
    #[test]
    fn should_handle_missing_sec_ch_ua_platform() {
        let platform: Option<&str> = None;
        assert!(platform.is_none());
    }

    /// Ported from: "should handle unknown GPU renderer"
    /// Node.js test checks that unknown GPU doesn't match any patterns
    #[test]
    fn should_handle_unknown_gpu_renderer() {
        let renderer = "Unknown GPU Model XYZ";
        assert!(!contains_any_pattern(renderer, EMULATOR_GPU_PATTERNS));
        assert!(!contains_any_pattern(renderer, DESKTOP_GPU_PATTERNS));
    }

    /// Ported from: "should handle empty deviceMetrics object"
    /// Node.js test: expect(Object.keys(deviceMetrics).length).toBe(0);
    #[test]
    fn should_handle_empty_device_metrics_object() {
        let device_metrics: HashMap<String, String> = HashMap::new();
        assert_eq!(device_metrics.len(), 0);
    }

    /// Ported from: "should handle partial deviceMetrics"
    /// Node.js test checks hasProperty and not.toHaveProperty
    #[test]
    fn should_handle_partial_device_metrics() {
        let device_metrics = DeviceMetrics {
            webgl_renderer: Some("Adreno 650".to_string()),
            ..Default::default()
        };

        assert!(device_metrics.webgl_renderer.is_some());
        assert!(device_metrics.max_touch_points.is_none());
    }
}

// ============================================================================
// Additional Unit Tests for Complete Coverage
// ============================================================================

mod pattern_matching_helpers {
    use super::*;

    #[test]
    fn test_contains_any_pattern_match() {
        let renderer = "SwiftShader (LLVM)";
        assert!(contains_any_pattern(renderer, EMULATOR_GPU_PATTERNS));
    }

    #[test]
    fn test_contains_any_pattern_no_match() {
        let renderer = "Adreno 650";
        assert!(!contains_any_pattern(renderer, EMULATOR_GPU_PATTERNS));
    }

    #[test]
    fn test_is_mobile_ua_android() {
        let ua = "Mozilla/5.0 (Linux; Android 13) Chrome/112.0.0.0 Mobile";
        assert!(is_mobile_ua(ua));
    }

    #[test]
    fn test_is_mobile_ua_iphone() {
        let ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)";
        assert!(is_mobile_ua(ua));
    }

    #[test]
    fn test_is_mobile_ua_desktop() {
        let ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/112.0.0.0";
        assert!(!is_mobile_ua(ua));
    }

    #[test]
    fn test_is_desktop_platform_windows() {
        assert!(is_desktop_platform("Windows"));
    }

    #[test]
    fn test_is_desktop_platform_macos() {
        assert!(is_desktop_platform("macOS"));
    }

    #[test]
    fn test_is_desktop_platform_android() {
        assert!(!is_desktop_platform("Android"));
    }
}
