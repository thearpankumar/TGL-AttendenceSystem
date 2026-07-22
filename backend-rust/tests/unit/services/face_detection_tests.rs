use attendance_geotag_backend::services::{
    check_photo_reuse, compare_hashes, compute_image_hash, detect_faces,
};
use image::{ImageBuffer, Rgb};
use std::io::Cursor;

#[tokio::test]
async fn test_detect_faces_invalid_format() {
    let result = detect_faces(b"invalid image bytes").await.unwrap();
    assert!(!result.face_detected);
    assert_eq!(result.reason, Some("invalid_image_format".to_string()));
}

#[tokio::test]
async fn test_detect_faces_image_too_small() {
    let img: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::new(50, 50);
    let mut bytes: Vec<u8> = Vec::new();
    img.write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Jpeg)
        .unwrap();

    let result = detect_faces(&bytes).await.unwrap();
    assert!(!result.face_detected);
    assert_eq!(result.reason, Some("image_too_small".to_string()));
}

#[tokio::test]
async fn test_detect_faces_valid_image() {
    let img: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::new(200, 200);
    let mut bytes: Vec<u8> = Vec::new();
    img.write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Jpeg)
        .unwrap();

    let result = detect_faces(&bytes).await.unwrap();
    assert!(result.reason.is_some());
}

#[test]
fn test_compute_and_compare_image_hashes() {
    let img: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::new(200, 200);
    let mut bytes: Vec<u8> = Vec::new();
    img.write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Jpeg)
        .unwrap();

    let hash1 = compute_image_hash(&bytes).unwrap();
    let hash2 = compute_image_hash(&bytes).unwrap();

    assert_eq!(compare_hashes(hash1, hash2), 0);

    let is_reused = check_photo_reuse(&bytes, &[hash1], 5).unwrap();
    assert!(is_reused);
}
