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
    use rand::RngExt;
    let mut rng = rand::rng();
    let mut bytes = [0u8; 16];
    rng.fill(&mut bytes);
    hex::encode(bytes)
}

fn hash_token(token: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

mod calculate_distance_tests {
    use super::*;

    #[test]
    fn should_calculate_distance_between_two_points_correctly() {
        let distance = calculate_distance(12.9715987, 77.5945627, 12.975, 77.591);
        assert!(distance > 0.0);
        assert!(distance < 1000.0);
    }

    #[test]
    fn should_return_0_for_same_coordinates() {
        let distance = calculate_distance(12.9715987, 77.5945627, 12.9715987, 77.5945627);
        assert_eq!(distance, 0.0);
    }

    #[test]
    fn should_calculate_distance_for_different_hemispheres() {
        let distance = calculate_distance(40.7128, -74.0060, -33.8688, 151.2093);
        assert!(distance > 15_000_000.0);
    }

    #[test]
    fn should_handle_edge_cases_at_poles() {
        let distance = calculate_distance(90.0, 0.0, -90.0, 0.0);
        assert!((distance - 20_015_087.0).abs() < 1000.0);
    }

    #[test]
    fn should_return_nan_for_invalid_coordinates() {
        let distance = calculate_distance(f64::NAN, 77.594, 12.971, 77.594);
        assert!(distance.is_nan());
    }

    #[test]
    fn should_handle_undefined_coordinates() {
        let distance = calculate_distance(f64::NAN, f64::NAN, f64::NAN, f64::NAN);
        assert!(distance.is_nan());
    }

    #[test]
    fn should_calculate_distance_near_equator() {
        let distance = calculate_distance(0.0, 0.0, 0.0, 1.0);
        assert!((distance - 111_194.0).abs() < 1000.0);
    }

    #[test]
    fn should_handle_prime_meridian_crossing() {
        let distance = calculate_distance(51.5074, -0.1278, 48.8566, 2.3522);
        assert!(distance > 300_000.0);
        assert!(distance < 400_000.0);
    }
}

mod generate_token_tests {
    use super::*;

    #[test]
    fn should_generate_a_32_character_token() {
        let token = generate_token();
        assert_eq!(token.len(), 32);
    }

    #[test]
    fn should_generate_unique_tokens() {
        let token1 = generate_token();
        let token2 = generate_token();
        assert_ne!(token1, token2);
    }

    #[test]
    fn should_generate_hexadecimal_tokens() {
        let token = generate_token();
        assert!(token.chars().all(|c| c.is_ascii_hexdigit()));
    }
}

mod hash_token_tests {
    use super::*;

    #[test]
    fn should_return_consistent_hash_for_same_input() {
        let token = "testtoken123";
        let hash1 = hash_token(token);
        let hash2 = hash_token(token);
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn should_return_64_character_sha256_hash() {
        let token = "testtoken";
        let hash = hash_token(token);
        assert_eq!(hash.len(), 64);
    }

    #[test]
    fn should_produce_different_hashes_for_different_tokens() {
        let hash1 = hash_token("token1");
        let hash2 = hash_token("token2");
        assert_ne!(hash1, hash2);
    }
}
