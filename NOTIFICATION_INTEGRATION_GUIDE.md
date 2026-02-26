# Notification Integration Guide - User App

## Overview
Yeh guide user mobile app mein Firebase Cloud Messaging (FCM) notifications integrate karne ke liye hai.

## Backend Setup (Already Done ✅)
Backend mein notification system already setup hai:
- Firebase Admin SDK configured
- FCM token storage (User model mein `fcmToken` aur `fcmTokens` array)
- API endpoints ready
- Notification sending functions ready

## Mobile App Side - Kya Karna Hai

### 1. Firebase Setup (Android/iOS)

#### Android:
1. **Firebase Console se `google-services.json` download karo**
   - Firebase Console → Project Settings → Your apps → Android app
   - `google-services.json` file download karo
   - Is file ko `android/app/` folder mein copy karo

2. **Dependencies add karo** (`android/app/build.gradle`):
```gradle
dependencies {
    implementation platform('com.google.firebase:firebase-bom:32.7.0')
    implementation 'com.google.firebase:firebase-messaging'
    implementation 'com.google.firebase:firebase-analytics'
}
```

3. **AndroidManifest.xml mein permissions add karo**:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

#### iOS:
1. **Firebase Console se `GoogleService-Info.plist` download karo**
   - Firebase Console → Project Settings → Your apps → iOS app
   - `GoogleService-Info.plist` download karo
   - Xcode project mein add karo

2. **Podfile mein add karo**:
```ruby
pod 'Firebase/Messaging'
pod 'Firebase/Analytics'
```

3. **Capabilities enable karo**:
   - Push Notifications
   - Background Modes → Remote notifications

### 2. FCM Token Registration

#### Flutter Example:
```dart
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'dart:io';

class NotificationService {
  final FirebaseMessaging _firebaseMessaging = FirebaseMessaging.instance;
  
  // Initialize notifications
  Future<void> initializeNotifications() async {
    // Request permission (iOS)
    NotificationSettings settings = await _firebaseMessaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    
    if (settings.authorizationStatus == AuthorizationStatus.authorized) {
      print('User granted permission');
      
      // Get FCM token
      String? token = await _firebaseMessaging.getToken();
      
      if (token != null) {
        await registerFCMToken(token);
      }
      
      // Listen for token refresh
      _firebaseMessaging.onTokenRefresh.listen((newToken) {
        registerFCMToken(newToken);
      });
      
      // Handle foreground messages
      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        print('Got a message whilst in the foreground!');
        print('Message data: ${message.data}');
        // Show local notification
        _showLocalNotification(message);
      });
      
      // Handle background messages (when app is terminated)
      FirebaseMessaging.onBackgroundMessage(_firebaseBackgroundHandler);
      
      // Handle notification tap (when app is in background)
      FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
        print('A new onMessageOpenedApp event was published!');
        _handleNotificationTap(message);
      });
      
      // Check if app was opened from notification (when app was terminated)
      RemoteMessage? initialMessage = await _firebaseMessaging.getInitialMessage();
      if (initialMessage != null) {
        _handleNotificationTap(initialMessage);
      }
    }
  }
  
  // Register FCM token with backend
  Future<void> registerFCMToken(String token) async {
    try {
      DeviceInfoPlugin deviceInfo = DeviceInfoPlugin();
      String deviceId;
      String platform;
      
      if (Platform.isAndroid) {
        AndroidDeviceInfo androidInfo = await deviceInfo.androidInfo;
        deviceId = androidInfo.id;
        platform = 'android';
      } else if (Platform.isIOS) {
        IosDeviceInfo iosInfo = await deviceInfo.iosInfo;
        deviceId = iosInfo.identifierForVendor ?? '';
        platform = 'ios';
      } else {
        deviceId = '';
        platform = 'web';
      }
      
      // Call your API to register token
      final response = await http.post(
        Uri.parse('${API_BASE_URL}/api/user-notification/fcm-token'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${userToken}', // Your auth token
        },
        body: jsonEncode({
          'token': token,
          'deviceId': deviceId,
          'platform': platform,
        }),
      );
      
      if (response.statusCode == 200) {
        print('FCM token registered successfully');
      } else {
        print('Failed to register FCM token: ${response.body}');
      }
    } catch (e) {
      print('Error registering FCM token: $e');
    }
  }
  
  // Show local notification when app is in foreground
  void _showLocalNotification(RemoteMessage message) {
    // Use flutter_local_notifications package
    // Implementation depends on your notification package
  }
  
  // Handle notification tap
  void _handleNotificationTap(RemoteMessage message) {
    final data = message.data;
    final type = data['type'];
    
    switch (type) {
      case 'order_status_update':
        // Navigate to order details
        final orderId = data['orderId'];
        Navigator.pushNamed(context, '/order-details', arguments: orderId);
        break;
      case 'promotion':
        // Navigate to promotion screen
        Navigator.pushNamed(context, '/promotions');
        break;
      default:
        // Navigate to home or notification screen
        Navigator.pushNamed(context, '/notifications');
    }
  }
}

// Background message handler (must be top-level function)
Future<void> _firebaseBackgroundHandler(RemoteMessage message) async {
  print('Handling a background message: ${message.messageId}');
  // Handle background notification
}
```

#### React Native Example:
```javascript
import messaging from '@react-native-firebase/messaging';
import DeviceInfo from 'react-native-device-info';

class NotificationService {
  async initializeNotifications() {
    // Request permission
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (enabled) {
      console.log('Authorization status:', authStatus);
      
      // Get FCM token
      const token = await messaging().getToken();
      if (token) {
        await this.registerFCMToken(token);
      }
      
      // Listen for token refresh
      messaging().onTokenRefresh(async (newToken) => {
        await this.registerFCMToken(newToken);
      });
      
      // Handle foreground messages
      messaging().onMessage(async (remoteMessage) => {
        console.log('A new FCM message arrived!', JSON.stringify(remoteMessage));
        // Show local notification
      });
      
      // Handle notification tap (background)
      messaging().onNotificationOpenedApp((remoteMessage) => {
        console.log('Notification caused app to open from background state:', remoteMessage);
        this.handleNotificationTap(remoteMessage);
      });
      
      // Check if app was opened from notification (terminated)
      messaging()
        .getInitialNotification()
        .then((remoteMessage) => {
          if (remoteMessage) {
            console.log('Notification caused app to open from quit state:', remoteMessage);
            this.handleNotificationTap(remoteMessage);
          }
        });
    }
  }
  
  async registerFCMToken(token) {
    try {
      const deviceId = await DeviceInfo.getUniqueId();
      const platform = Platform.OS;
      
      const response = await fetch(`${API_BASE_URL}/api/user-notification/fcm-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          token: token,
          deviceId: deviceId,
          platform: platform,
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        console.log('FCM token registered successfully');
      }
    } catch (error) {
      console.error('Error registering FCM token:', error);
    }
  }
  
  handleNotificationTap(remoteMessage) {
    const { data } = remoteMessage;
    const type = data?.type;
    
    switch (type) {
      case 'order_status_update':
        NavigationService.navigate('OrderDetails', { orderId: data.orderId });
        break;
      case 'promotion':
        NavigationService.navigate('Promotions');
        break;
      default:
        NavigationService.navigate('Notifications');
    }
  }
}
```

### 3. API Endpoints

#### Register FCM Token
```
POST /api/user-notification/fcm-token
Headers:
  Authorization: Bearer <user_token>
Body:
{
  "token": "fcm_token_here",
  "deviceId": "device_unique_id",
  "platform": "android" | "ios" | "web"
}
```

#### Remove FCM Token (Logout pe call karo)
```
POST /api/user-notification/fcm-token/remove
Headers:
  Authorization: Bearer <user_token>
Body:
{
  "token": "fcm_token_here"
}
```

#### Test Notification
```
POST /api/user-notification/test
Headers:
  Authorization: Bearer <user_token>
```

### 4. Notification Types aur Handling

Backend se aane wali notifications ke types:

1. **Order Status Updates** (`type: 'order_status_update'`)
   - `orderId`: Order ID
   - `orderNumber`: Order number
   - `status`: Order status (pending, confirmed, processing, etc.)

2. **Promotions** (`type: 'promotion'`)
   - Promotion details

3. **General** (`type: 'general'`)
   - General notifications

### 5. Important Points

1. **App Start pe FCM Token Register karo**
   - User login ke baad immediately token register karo
   - Token refresh hone pe automatically update karo

2. **Logout pe Token Remove karo**
   - User logout pe FCM token remove karo backend se
   - Isse invalid tokens clean rahenge

3. **Foreground Notifications**
   - App open hone pe bhi notifications show karo
   - Local notification package use karo (flutter_local_notifications, react-native-push-notification)

4. **Background Notifications**
   - Background message handler setup karo
   - App terminated state mein bhi notifications handle karo

5. **Notification Tap Handling**
   - Notification tap pe appropriate screen navigate karo
   - Deep linking implement karo

### 6. Testing

1. **Test Notification API call karo**:
   ```
   POST /api/user-notification/test
   ```
   Isse test notification send hoga

2. **Check Logs**:
   - Backend logs check karo notification send hone ke baad
   - Mobile app logs check karo token registration ke liye

### 7. Troubleshooting

**Problem: Notifications nahi aa rahe**
- Check karo FCM token properly register hua hai ya nahi
- Firebase console mein check karo service account properly configured hai
- Check karo user ke paas valid FCM token hai database mein

**Problem: Token register nahi ho raha**
- Check karo API endpoint correct hai
- Check karo authentication token valid hai
- Check karo request body format correct hai

**Problem: Background notifications nahi aa rahe**
- Check karo background message handler properly setup hai
- Check karo app permissions properly granted hain
- iOS pe check karo background modes enabled hain

## Summary

1. ✅ Firebase setup karo (google-services.json / GoogleService-Info.plist)
2. ✅ FCM dependencies add karo
3. ✅ FCM token get karo aur backend pe register karo
4. ✅ Foreground aur background message handlers setup karo
5. ✅ Notification tap handling implement karo
6. ✅ Logout pe token remove karo
7. ✅ Test karo

Backend already ready hai, bas mobile app side implementation karna hai! 🚀
