macro_rules! assert_approx_eq {
    ($left:expr, $right:expr, $tolerance:expr) => {
        let left = $left;
        let right = $right;
        let tolerance = $tolerance;
        assert!(
            (left - right).abs() <= tolerance,
            "assertion failed: {} is not approximately equal to {} (within tolerance {})",
            left,
            right,
            tolerance
        );
    };
}

pub(crate) use assert_approx_eq;
