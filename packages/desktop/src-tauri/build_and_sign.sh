#!/bin/bash
set -e

# This script builds and packages the example into a macOS bundle so it can be properly tested on macOS

cargo build --bin test

export TARGET_DIR=./target

# Clean any existing app bundle to avoid stale files
rm -rf "$TARGET_DIR/TestExample.app"

mkdir -p "$TARGET_DIR/TestExample.app/Contents/MacOS"

cp "$TARGET_DIR/debug/test" "$TARGET_DIR/TestExample.app/Contents/MacOS"

cat <<EOF > "$TARGET_DIR/TestExample.app/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>TestExample</string>
    <key>CFBundleDisplayName</key>
    <string>Test Example</string>
    <!-- TODO set icon -->
    <key>CFBundleVersion</key>
    <string>0.1.0</string>
    <key>CFBundleIdentifier</key>
    <string>ai.opencode.desktop.test</string>
    <key>CFBundleExecutable</key>
    <string>test</string>
   	<key>NSUserActivityTypes</key>
  	<array>
  		<string>INSendMessageIntent</string>
  	</array>
   <key>NSUserNotificationsUsageDescription</key>
   <string>Allow Test Example to send notifications</string>
   <key>NSExtension</key>
   <dict>
      <key>IntentsSupported</key>
      <array>
         <string>INSendMessageIntent</string>
      </array>
   </dict>
</dict>
</plist>
EOF

echo "> code signing"
export APPLE_SIGNING_IDENTITY=XF923AZS22

# Verify signing identity exists
if ! security find-identity -v -p codesigning | grep -q "$APPLE_SIGNING_IDENTITY"; then
    echo "ERROR: Signing identity $APPLE_SIGNING_IDENTITY not found"
    echo "Available identities:"
    security find-identity -v -p codesigning
    exit 1
fi

# Create entitlements file (outside app bundle to avoid signing issues)
cat <<EOF > "$TARGET_DIR/Entitlements.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.developer.usernotifications.communication</key>
  <true/>
</dict>
</plist>
EOF

# Sign the application bundle (sign executable directly, not with --deep, to properly apply entitlements)
codesign -s "$APPLE_SIGNING_IDENTITY" --entitlements "$TARGET_DIR/Entitlements.plist" --force -v "$TARGET_DIR/TestExample.app"

# Verify the signature
echo "> verifying signature"
codesign -v "$TARGET_DIR/TestExample.app/"

echo "> running application"
RUST_LOG=trace "$TARGET_DIR/TestExample.app/Contents/MacOS/test"
