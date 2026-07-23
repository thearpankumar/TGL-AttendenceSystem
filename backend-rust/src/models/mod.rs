mod admin;
mod attendance;
mod batch;
mod device;
mod device_fingerprint;
mod flag;
mod location;
mod photo_hash;
mod session;
mod short_link;
mod system_config;
mod webauthn_challenge;
mod webauthn_credential;
mod webauthn_reenrollment_log;

pub use admin::*;
pub use attendance::*;
pub use batch::*;
pub use device::*;
pub use device_fingerprint::*;
pub use flag::*;
pub use location::*;
pub use photo_hash::*;
pub use session::*;
pub use short_link::*;
pub use system_config::*;
pub use webauthn_challenge::{WebAuthnChallenge, WebAuthnChallengeType};
pub use webauthn_credential::*;
pub use webauthn_reenrollment_log::*;

// Re-export Severity from constants for convenience
pub use crate::constants::Severity;

pub mod optional_chrono_bson {
    use chrono::{DateTime, Utc};
    use serde::{self, Deserialize, Deserializer, Serialize, Serializer};

    pub fn serialize<S>(date: &Option<DateTime<Utc>>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        #[derive(Serialize)]
        struct Helper<'a>(
            #[serde(with = "bson::serde_helpers::datetime::FromChrono04DateTime")]
            &'a DateTime<Utc>,
        );

        date.as_ref().map(Helper).serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<DateTime<Utc>>, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct Helper(
            #[serde(with = "bson::serde_helpers::datetime::FromChrono04DateTime")] DateTime<Utc>,
        );

        Ok(Option::<Helper>::deserialize(deserializer)?.map(|h| h.0))
    }
}
