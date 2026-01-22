use std::time::Duration;

use opencode_lib::notification_macos;

#[tokio::main]
async fn main() {
    // loop {
    let sent = notification_macos::send_communication_notification(
        "title", "body", "sender", None, "conv-id",
    );
    dbg!(sent);
    tokio::time::sleep(Duration::from_secs(2)).await;
    // }
}
