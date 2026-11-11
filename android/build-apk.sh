#!/usr/bin/env bash
# Build the Nova AI Hub Android APK without Gradle (aapt2 + javac + d8 + apksigner).
# Needs: JDK 17, Android build-tools 34, platform android-34.
#   JAVA_HOME=/path/to/jdk BUILD_TOOLS=/path/to/build-tools/34.0.0 ANDROID_JAR=/path/to/platforms/android-34/android.jar \
#   KEYSTORE=release.jks KS_PASS=secret ./build-apk.sh
set -euo pipefail
cd "$(dirname "$0")"
: "${BUILD_TOOLS:?set BUILD_TOOLS}"; : "${ANDROID_JAR:?set ANDROID_JAR}"
export PATH="$JAVA_HOME/bin:$PATH"
VERSION_NAME="${VERSION_NAME:-1.2.0}"; VERSION_CODE="${VERSION_CODE:-4}"
OUT="${OUT:-build}"
rm -rf "$OUT" && mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/dex"

"$BUILD_TOOLS/aapt2" compile --dir res -o "$OUT/res.zip"
"$BUILD_TOOLS/aapt2" link -o "$OUT/base.apk" -I "$ANDROID_JAR" --manifest AndroidManifest.xml -A assets \
  --java "$OUT/gen" --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" "$OUT/res.zip"
javac -nowarn -source 8 -target 8 -bootclasspath "$ANDROID_JAR" -d "$OUT/classes" \
  $(find "$OUT/gen" src -name '*.java') 2>&1 | grep -v "warning" || true
"$BUILD_TOOLS/d8" --release --min-api 24 --lib "$ANDROID_JAR" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT/dex" && zip -q ../unsigned.apk classes.dex)
"$BUILD_TOOLS/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

if [ -z "${KEYSTORE:-}" ]; then
  KEYSTORE="$OUT/debug.jks"; KS_PASS="android"
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias nova \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Nova AI Hub" >/dev/null 2>&1
fi
"$BUILD_TOOLS/apksigner" sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --out "$OUT/Nova-AI-Hub.apk" "$OUT/aligned.apk"
"$BUILD_TOOLS/apksigner" verify "$OUT/Nova-AI-Hub.apk"
echo "APK ready: $OUT/Nova-AI-Hub.apk"
