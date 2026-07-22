// GeoUtils Extended Tests - Ported from backend/tests/geoUtils.extended.test.js
// Contains boundary cases, precision tests, invalid input tests, session token tests, and performance tests

use sha2::{Digest, Sha256};

// Helper functions that mirror the Node.js implementation
fn calculate_distance(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    const EARTH_RADIUS: f64 = 6_371_000.0;

    let lat1_rad = lat1.to_radians();
    let lat2_rad = lat2.to_radians();
    let delta_lat = (lat2 - lat1).to_radians();
    let delta_lon = (lon2 - lon1).to_radians();

    let a = (delta_lat / 2.0).sin().powi(2)
        + lat1_rad.cos() * lat2_rad.cos() * (delta_lon / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());

    EARTH_RADIUS * c
}

fn generate_token() -> String {
    use rand::Rng;
    let mut rng = rand::rng();
    let mut bytes = [0u8; 16];
    rng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

// ============================================
// GeoUtils Extended Tests - Boundary Cases
// ============================================
mod calculate_distance_boundary_cases {
    use super::*;

    #[test]
    fn should_return_0_for_identical_coordinates() {
        let distance = calculate_distance(12.971, 77.594, 12.971, 77.594);
        assert_eq!(distance, 0.0);
    }

    #[test]
    fn should_handle_coordinates_at_equator() {
        let distance = calculate_distance(0.0, 0.0, 0.0, 1.0);
        // toBeCloseTo(111194, -3) means within 1000 of 111194
        assert!((distance - 111194.0).abs() < 1000.0);
    }

    #[test]
    fn should_handle_coordinates_at_prime_meridian() {
        let distance = calculate_distance(51.5074, 0.0, 48.8566, 0.0);
        assert!(distance > 250000.0);
        assert!(distance < 300000.0);
    }

    #[test]
    fn should_handle_north_pole_to_south_pole() {
        let distance = calculate_distance(90.0, 0.0, -90.0, 0.0);
        // toBeCloseTo(20015087, -5) means within 100000 of 20015087
        assert!((distance - 20015087.0).abs() < 100000.0);
    }

    #[test]
    fn should_handle_very_small_distances() {
        let distance = calculate_distance(12.971, 77.594, 12.971, 77.59400001);
        assert!(distance < 1.0);
    }

    #[test]
    fn should_handle_large_distances() {
        let distance = calculate_distance(40.7128, -74.0060, -33.8688, 151.2093);
        assert!(distance > 15_000_000.0);
        assert!(distance < 20_000_000.0);
    }
}

// ============================================
// GeoUtils Extended Tests - Precision Tests
// ============================================
mod calculate_distance_precision_tests {
    use super::*;

    #[test]
    fn should_be_consistent_in_both_directions() {
        let d1 = calculate_distance(12.971, 77.594, 13.0, 78.0);
        let d2 = calculate_distance(13.0, 78.0, 12.971, 77.594);
        // toBeCloseTo with precision 10
        assert!((d1 - d2).abs() < 0.0001);
    }

    #[test]
    fn should_handle_float_precision_edge_cases() {
        let distance = calculate_distance(0.0000001, 0.0000001, -0.0000001, -0.0000001);
        assert!(distance < 100.0);
    }

    #[test]
    fn should_calculate_100m_correctly() {
        let distance = calculate_distance(12.9715987, 77.5945627, 12.9724, 77.5945627);
        assert!(distance > 80.0);
        assert!(distance < 120.0);
    }

    #[test]
    fn should_calculate_1km_correctly() {
        let distance = calculate_distance(12.971, 77.594, 12.980, 77.594);
        assert!(distance > 900.0);
        assert!(distance < 1100.0);
    }
}

// ============================================
// GeoUtils Extended Tests - Invalid Input Tests
// ============================================
mod calculate_distance_invalid_input_tests {
    use super::*;

    #[test]
    fn should_return_nan_for_nan_coordinates() {
        let distance1 = calculate_distance(f64::NAN, 77.594, 12.971, 77.594);
        let distance2 = calculate_distance(12.971, f64::NAN, 12.971, 77.594);
        assert!(distance1.is_nan());
        assert!(distance2.is_nan());
    }

    #[test]
    fn should_return_nan_for_undefined_coordinates() {
        // In Rust, undefined is represented as None/NaN
        let distance1 =
            calculate_distance(f64::NAN, 77.594, 12.971, 77.594);
        let distance2 =
            calculate_distance(12.971, f64::NAN, 12.971, 77.594);
        assert!(distance1.is_nan());
        assert!(distance2.is_nan());
    }

    #[test]
    fn should_handle_infinity() {
        let distance = calculate_distance(f64::INFINITY, 77.594, 12.971, 77.594);
        assert!(distance.is_nan() || distance.is_infinite());
    }
}

// ============================================
// Session Token Tests - generateToken Extended Tests
// ============================================
mod generate_token_extended_tests {
    use super::*;

    #[test]
    fn should_generate_exactly_32_characters() {
        let token = generate_token();
        assert_eq!(token.len(), 32);
    }

    #[test]
    fn should_only_contain_hexadecimal_characters() {
        let token = generate_token();
        assert!(token.chars().all(|c| c.is_ascii_hexdigit()));
        // Verify it matches the regex /^[a-f0-9]{32}$/
        assert!(token.chars().all(|c| matches!(c, 'a'..='f' | '0'..='9')));
    }

    #[test]
    fn should_generate_unique_tokens_collision_test() {
        use std::collections::HashSet;
        let mut tokens = HashSet::new();
        for _ in 0..1000 {
            tokens.insert(generate_token());
        }
        assert_eq!(tokens.len(), 1000);
    }

    #[test]
    fn should_not_generate_empty_token() {
        let token = generate_token();
        assert_ne!(token, "");
        assert!(!token.is_empty());
    }
}

// ============================================
// Session Token Tests - hashToken Extended Tests
// ============================================
mod hash_token_extended_tests {
    use super::*;

    #[test]
    fn should_return_exactly_64_characters_sha256() {
        let hash = hash_token("testtoken");
        assert_eq!(hash.len(), 64);
    }

    #[test]
    fn should_only_contain_hexadecimal_characters() {
        let hash = hash_token("testtoken");
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
        // Verify it matches the regex /^[a-f0-9]{64}$/
        assert!(hash.chars().all(|c| matches!(c, 'a'..='f' | '0'..='9')));
    }

    #[test]
    fn should_be_deterministic() {
        let token = "sametokenvalue";
        let hash1 = hash_token(token);
        let hash2 = hash_token(token);
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn should_produce_different_hashes_for_similar_tokens() {
        let hash1 = hash_token("token1");
        let hash2 = hash_token("token2");
        assert_ne!(hash1, hash2);
    }

    #[test]
    fn should_handle_empty_string() {
        let hash = hash_token("");
        assert_eq!(hash.len(), 64);
    }

    #[test]
    fn should_handle_special_characters() {
        let hash = hash_token("!@#$%^&*()");
        assert_eq!(hash.len(), 64);
    }

    #[test]
    fn should_handle_unicode_characters() {
        let hash = hash_token("日本語");
        assert_eq!(hash.len(), 64);
    }

    #[test]
    fn should_handle_very_long_tokens() {
        let long_token = "a".repeat(1000);
        let hash = hash_token(&long_token);
        assert_eq!(hash.len(), 64);
    }
}

// ============================================
// Token Security Tests
// ============================================
mod token_security_tests {
    use super::*;

    #[test]
    fn should_not_be_reversible_one_way_hash() {
        let token = "testtoken123";
        let hash = hash_token(token);
        assert_ne!(hash, token);
        assert!(!hash.contains(token));
    }

    #[test]
    fn should_produce_different_hashes_for_case_variations() {
        let hash1 = hash_token("ABC");
        let hash2 = hash_token("abc");
        assert_ne!(hash1, hash2);
    }

    #[test]
    fn should_handle_whitespace_correctly() {
        let hash1 = hash_token("test");
        let hash2 = hash_token(" test");
        let hash3 = hash_token("test ");
        let hash4 = hash_token(" test ");

        assert_ne!(hash1, hash2);
        assert_ne!(hash1, hash3);
        assert_ne!(hash1, hash4);
    }
}

// ============================================
// Distance Calculation Edge Cases
// ============================================
mod distance_calculation_edge_cases {
    use super::*;

    #[test]
    fn should_handle_same_location_with_different_precision() {
        let d1 = calculate_distance(12.9715987, 77.5945627, 12.9715987, 77.5945627);
        let d2 = calculate_distance(12.971, 77.595, 12.971, 77.595);

        assert_eq!(d1, 0.0);
        assert_eq!(d2, 0.0);
    }

    #[test]
    fn should_handle_negative_coordinates_in_both_positions() {
        let distance = calculate_distance(-33.8688, -151.2093, -33.8688, -151.2093);
        assert_eq!(distance, 0.0);
    }

    #[test]
    fn should_handle_mixed_sign_coordinates() {
        let distance = calculate_distance(40.7128, -74.0060, -33.8688, 151.2093);
        assert!(distance > 0.0);
    }

    #[test]
    fn should_calculate_accurate_distance_for_known_locations() {
        // Bangalore coordinates
        let bangalore_lat = 12.9716;
        let bangalore_lon = 77.5946;
        // Delhi coordinates
        let delhi_lat = 28.7041;
        let delhi_lon = 77.1025;

        let distance = calculate_distance(bangalore_lat, bangalore_lon, delhi_lat, delhi_lon);

        assert!(distance > 1_700_000.0);
        assert!(distance < 1_800_000.0);
    }
}

// ============================================
// Performance Tests
// ============================================
mod performance_tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn should_handle_10000_calculations_quickly() {
        let start = Instant::now();

        for _ in 0..10000 {
            calculate_distance(12.971, 77.594, 13.0, 78.0);
        }

        let elapsed = start.elapsed().as_millis();
        // expect(elapsed).toBeLessThan(100) - should complete in under 100ms
        assert!(elapsed < 100, "Took {}ms, expected < 100ms", elapsed);
    }

    #[test]
    fn should_handle_1000_token_generations_quickly() {
        let start = Instant::now();

        for _ in 0..1000 {
            generate_token();
        }

        let elapsed = start.elapsed().as_millis();
        // expect(elapsed).toBeLessThan(100) - should complete in under 100ms
        assert!(elapsed < 100, "Took {}ms, expected < 100ms", elapsed);
    }

    #[test]
    fn should_handle_1000_hash_operations_quickly() {
        let start = Instant::now();

        for i in 0..1000 {
            hash_token(&format!("token{}", i));
        }

        let elapsed = start.elapsed().as_millis();
        // expect(elapsed).toBeLessThan(100) - should complete in under 100ms
        assert!(elapsed < 100, "Took {}ms, expected < 100ms", elapsed);
    }
}
