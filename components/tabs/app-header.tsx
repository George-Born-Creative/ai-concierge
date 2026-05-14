import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function AppHeader() {
  const router = useRouter();

  return (
    <View style={styles.header}>
      <View style={styles.brand}>
        <View style={styles.logoMark}>
          <View style={[styles.logoDot, styles.blueDot]} />
          <View style={[styles.logoDot, styles.redDot]} />
          <View style={[styles.logoDot, styles.yellowDot]} />
          <View style={[styles.logoDot, styles.greenDot]} />
        </View>
        <View>
          <Text style={styles.appName}>AI-Concierge</Text>
          <Text style={styles.appTagline}>Voice assistant</Text>
        </View>
      </View>

      <Pressable style={styles.homeButton} onPress={() => router.push('/')}>
        <MaterialIcons name="home" size={22} color="#1A73E8" />
        <Text style={styles.homeButtonText}>Home</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
    borderBottomColor: '#E8EAED',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 18,
    paddingHorizontal: 12,
    paddingTop: 38,
  },
  brand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  logoMark: {
    alignItems: 'center',
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  logoDot: {
    borderRadius: 10,
    position: 'absolute',
  },
  blueDot: {
    backgroundColor: '#4285F4',
    height: 27,
    left: 4,
    width: 27,
  },
  redDot: {
    backgroundColor: '#EA4335',
    height: 17,
    right: 6,
    top: 6,
    width: 17,
  },
  yellowDot: {
    backgroundColor: '#FBBC04',
    bottom: 6,
    height: 15,
    right: 8,
    width: 15,
  },
  greenDot: {
    backgroundColor: '#34A853',
    bottom: 10,
    height: 12,
    left: 12,
    width: 12,
  },
  appName: {
    color: '#202124',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  appTagline: {
    color: '#5F6368',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  homeButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8F0FE',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  homeButtonText: {
    color: '#1A73E8',
    fontSize: 13,
    fontWeight: '600',
  },
});
