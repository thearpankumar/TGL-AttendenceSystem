use axum::Router;

pub struct TestApp {
    pub router: Router,
}

impl TestApp {
    pub fn new(router: Router) -> Self {
        Self { router }
    }
}
