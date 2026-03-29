# Capacitor WebView - keep JS interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Capacitor core
-keep class com.getcapacitor.** { *; }
-dontwarn com.getcapacitor.**

# AndroidX
-keep class androidx.** { *; }
-dontwarn androidx.**

# Keep line number info for crash reporting
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# WebView
-keepclassmembers class * extends android.webkit.WebViewClient {
    public void *(android.webkit.WebView, java.lang.String);
    public void *(android.webkit.WebView, java.lang.String, android.graphics.Bitmap);
    public boolean *(android.webkit.WebView, java.lang.String);
}
