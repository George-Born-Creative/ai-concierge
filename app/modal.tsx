import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Link } from 'expo-router';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function ModalScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <MaterialIcons name="mic" size={34} color="#FFFFFF" />
        </View>
        <Text style={styles.title}>Voice concierge</Text>
        <Text style={styles.subtitle}>
          Tap the mic from Assistant to start a natural conversation with your concierge.
        </Text>
      </View>
      <Link href="/" dismissTo style={styles.link}>
        <Text style={styles.linkText}>Back to Assistant</Text>
      </Link>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 32,
    borderWidth: 1,
    padding: 28,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    marginBottom: 20,
    width: 64,
  },
  title: {
    color: '#202124',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: '#5F6368',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
    textAlign: 'center',
  },
  link: {
    marginTop: 18,
    paddingVertical: 15,
  },
  linkText: {
    color: '#1A73E8',
    fontSize: 16,
    fontWeight: '800',
  },
});
