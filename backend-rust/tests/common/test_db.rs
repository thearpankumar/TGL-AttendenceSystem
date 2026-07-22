use std::sync::OnceLock;
use testcontainers::ContainerRequest;
use testcontainers::GenericImage;
use testcontainers::RunnableImage;
use testcontainers_modules::mongodb::Mongodb;
use testcontainers_modules::redis::Redis;

static TEST_ENV: OnceLock<TestEnvironment> = OnceLock::new();

pub struct TestEnvironment {
    pub mongo_container: testcontainers::Container<Mongodb>,
    pub redis_container: testcontainers::Container<Redis>,
    pub mongo_uri: String,
    pub redis_uri: String,
}

impl TestEnvironment {
    pub async fn new() -> Self {
        use testcontainers::runners::AsyncRunner;

        let mongo_image = RunnableImage::from(Mongodb::default())
            .with_env_var("MONGO_INITDB_ROOT_USERNAME", "test")
            .with_env_var("MONGO_INITDB_ROOT_PASSWORD", "test");

        let mongo_container = mongo_image
            .start()
            .await
            .expect("Failed to start MongoDB container");

        let redis_container = Redis::default()
            .start()
            .await
            .expect("Failed to start Redis container");

        let mongo_port = mongo_container
            .get_host_port_ipv4(27017)
            .await
            .expect("Failed to get MongoDB port");

        let redis_port = redis_container
            .get_host_port_ipv4(6379)
            .await
            .expect("Failed to get Redis port");

        let mongo_uri = format!("mongodb://test:test@localhost:{}", mongo_port);
        let redis_uri = format!("redis://localhost:{}", redis_port);

        Self {
            mongo_container,
            redis_container,
            mongo_uri,
            redis_uri,
        }
    }

    pub fn mongo_uri(&self) -> &str {
        &self.mongo_uri
    }

    pub fn redis_uri(&self) -> &str {
        &self.redis_uri
    }
}

pub async fn get_test_environment() -> &'static TestEnvironment {
    TEST_ENV
        .get_or_init(|| {
            tokio::task::block_in_place(|| {
                tokio::runtime::Handle::current()
                    .block_on(TestEnvironment::new())
            })
        })
}

pub async fn get_test_database(db_name: Option<&str>) -> mongodb::Database {
    let env = get_test_environment().await;

    let client = mongodb::Client::with_options(
        mongodb::options::ClientOptions::parse(env.mongo_uri())
            .await
            .expect("Failed to parse MongoDB URI"),
    )
    .expect("Failed to create MongoDB client");

    let name = db_name.unwrap_or(&format!("test_{}", uuid::Uuid::new_v4()));
    client.database(name)
}

pub async fn get_test_redis() -> redis::Connection {
    let env = get_test_environment().await;

    redis::Client::open(env.redis_uri())
        .expect("Failed to create Redis client")
        .get_connection()
        .expect("Failed to get Redis connection")
}

pub fn cleanup_test_db(db: &mongodb::Database) {
    let db = db.clone();
    tokio::spawn(async move {
        let _ = db.drop().await;
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_environment_starts() {
        let env = get_test_environment().await;
        assert!(!env.mongo_uri().is_empty());
        assert!(!env.redis_uri().is_empty());
    }
}
