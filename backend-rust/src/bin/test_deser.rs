use mongodb::bson::doc;


#[tokio::main]
async fn main() {
    let client = mongodb::Client::with_uri_str("mongodb://mongo1:27017/?replicaSet=rs0").await.unwrap();
    let db = client.database("attendance-geotag");
    let coll = db.collection::<mongodb::bson::Document>("sessions");
    let mut cursor = coll.find(doc!{}).await.unwrap();
    
    while cursor.advance().await.unwrap() {
        let doc = cursor.deserialize_current().unwrap();
        println!("DOC: {:?}", doc);
        
        match mongodb::bson::from_document::<attendance_geotag_backend::models::Session>(doc) {
            Ok(_) => println!("Success!"),
            Err(e) => println!("Error: {:?}", e),
        }
    }
}
