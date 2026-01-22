//! macOS Communication Notifications
//!
//! Provides Discord-style notifications with custom avatar icons
//! and the app icon shown as a small badge.

/// Sends a macOS Communication Notification with custom sender avatar.
///
/// Returns `true` if successful, `false` if fallback should be used.
pub fn send_communication_notification(
    title: &str,
    body: &str,
    sender_name: &str,
    sender_image_data: Option<&[u8]>,
    conversation_id: &str,
) -> bool {
    #[cfg(target_os = "macos")]
    {
        use base64::Engine;
        use objc2_foundation::{NSData, NSString};
        use objc2_intents::{
            INImage, INInteraction, INInteractionDirection, INOutgoingMessageType, INPerson,
            INPersonHandle, INPersonHandleType, INSendMessageIntent,
        };
        use objc2_user_notifications::{
            UNMutableNotificationContent, UNNotificationRequest, UNUserNotificationCenter,
        };

        unsafe {
            const PNG_AVATAR_BASE64: &str = "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAABLUlEQVR4nO3SIQEAMAzAsOmcfx+7jIMGhBd0bvfomt8BGAADYAAMgAEwAAbAABgAA2AADIABMAAGwAAYAANgAAyAATAABsAAGAADYAAMgAEwAAbAABgAA2AADIABMAAGwAAYAANggDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQ+TX4oVvvtE5AAAAABJRU5ErkJggg==";
            // Check if we have a valid bundle (required for UNUserNotificationCenter)
            use objc2_foundation::{NSArray, NSBundle, NSError};

            let main_bundle = NSBundle::mainBundle();
            let bundle_id = main_bundle.bundleIdentifier();

            if bundle_id.is_none() {
                // No bundle identifier - UNUserNotificationCenter will crash
                // This happens when running as a plain binary (e.g., cargo run --bin test)
                // Tauri handles this by running within an app bundle
                println!(
                    "[notification_macos] No bundle identifier found - Communication Notifications unavailable"
                );
                println!(
                    "[notification_macos] This is expected when running via 'cargo run'. Use 'tauri dev' or build an app bundle to test notifications."
                );
                return false;
            }
            // 1. Create INImage from binary data

            use objc2::{AnyThread, runtime::ProtocolObject};
            use objc2_user_notifications::{
                UNNotificationContentProviding, UNTimeIntervalNotificationTrigger,
            };
            // let data = match sender_image_data {
            //     Some(data) => Some(data.to_vec()),
            //     None => base64::engine::general_purpose::STANDARD
            //         .decode(PNG_AVATAR_BASE64)
            //         .ok(),
            // };
            let img_bytes = std::fs::read(
                "/Users/brendonovich/github.com/sst/opencode/packages/desktop/placeholder.png",
            )
            .unwrap();
            let avatar = INImage::imageWithImageData(&NSData::with_bytes(img_bytes.as_ref()));

            // 2. Create person handle for sender
            let handle_value = NSString::from_str("1234");
            let person_handle = INPersonHandle::initWithValue_type(
                INPersonHandle::alloc(),
                Some(&handle_value),
                INPersonHandleType::Unknown,
            );

            // dbg!(avatar.is_some());

            // 3. Create sender INPerson with avatar
            let display_name = NSString::from_str(sender_name);
            let sender = INPerson::initWithPersonHandle_nameComponents_displayName_image_contactIdentifier_customIdentifier_isMe(
                INPerson::alloc(),
                &person_handle,
                None, // name components
                Some(&display_name),
                Some(&avatar),
                None, // contact identifier
                None, // custom identifier
                false, // isMe
            );

            let handle_value = NSString::from_str("5678");
            let me_handle = INPersonHandle::initWithValue_type(
                INPersonHandle::alloc(),
                Some(&handle_value),
                INPersonHandleType::Unknown,
            );

            let me = INPerson::initWithPersonHandle_nameComponents_displayName_image_contactIdentifier_customIdentifier_isMe(
              INPerson::alloc(),
              &me_handle,
              None, // name components
              None,
              None,
              None, // contact identifier
              None, // custom identifier
              true, // isMe
            );

            // 5. Create INSendMessageIntent
            let content_str = NSString::from_str(body);
            let conv_id = NSString::from_str(conversation_id);

            let intent = INSendMessageIntent::initWithRecipients_outgoingMessageType_content_speakableGroupName_conversationIdentifier_serviceName_sender_attachments(
                INSendMessageIntent::alloc(),
                Some(&NSArray::from_retained_slice(&[me])),
                INOutgoingMessageType::OutgoingMessageText,
                Some(&content_str),
                None, // speakable group name
                Some(&conv_id),
                None, // service name
                Some(&sender),
                None, // attachments
            );

            // 6. Set image for sender parameter (ensures avatar is used)
            // if let Some(ref avatar_img) = avatar {
            let param_name = NSString::from_str("sender");
            intent.setImage_forParameterNamed(Some(&avatar), &param_name);
            // }

            // 7. Create and donate interaction
            let interaction =
                INInteraction::initWithIntent_response(INInteraction::alloc(), &intent, None);
            interaction.setDirection(INInteractionDirection::Incoming);

            // Donate the interaction
            interaction.donateInteractionWithCompletion(None);

            let title = title.to_string();
            let body = body.to_string();

            // 8. Create notification content with Communication Notification category
            let content = UNMutableNotificationContent::new();
            content.setTitle(&NSString::from_str(&title));
            content.setBody(&NSString::from_str(&body));
            content.setCategoryIdentifier(&NSString::from_str("message"));

            // Set the communication context using thread identifier
            // content.setThreadIdentifier(&conv_id);

            fn as_protocol(
                msg_intent: &INSendMessageIntent,
            ) -> &ProtocolObject<dyn UNNotificationContentProviding> {
                // SAFETY: `INSendMessageIntent` implements the `UNNotificationContentProviding` protocol,
                // even thoough it doesn't currently implement the trait: https://github.com/madsmtm/objc2/issues/814
                unsafe { std::mem::transmute(msg_intent) }
            }

            let content = content
                .contentByUpdatingWithProvider_error(as_protocol(&intent))
                .unwrap();

            // 9. Create and deliver notification request
            let identifier = NSString::from_str(&uuid::Uuid::new_v4().to_string());
            // let trigger = UNTimeIntervalNotificationTrigger::triggerWithTimeInterval_repeats(
            //     0.1, // deliver almost immediately
            //     false,
            // );

            let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
                &identifier,
                &content,
                None,
                // Some(&trigger),
            );

            let center = UNUserNotificationCenter::currentNotificationCenter();
            center.addNotificationRequest_withCompletionHandler(
                &request,
                Some(&block2::RcBlock::new(move |err: *mut NSError| {
                    dbg!(err.is_null());
                    if !err.is_null() {
                        unsafe {
                            dbg!((*err).domain());
                            dbg!((*err).code());
                            dbg!((*err).localizedDescription());
                        }
                    }
                })),
            );
        }

        true
    }

    #[cfg(not(target_os = "macos"))]
    false
}
