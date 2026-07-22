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
