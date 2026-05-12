import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

const stats = [
  { label: 'Commands', value: 'Contact' },
  { label: 'Input', value: 'Voice + text' },
  { label: 'Mode', value: 'Assistant' },
];

const permissions = [
  'Read contacts to fetch, list, and identify people.',
  'Write contacts to create and delete contacts from commands.',
  'Speech-to-text can be connected to the mic action next.',
];

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>Profile</Text>
          <Text style={styles.headerTitle}>Assistant settings</Text>
        </View>
        <View style={styles.smallAvatar}>
          <Text style={styles.smallAvatarText}>D</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>D</Text>
          </View>
          <Text style={styles.name}>Dave</Text>
          <Text style={styles.subtitle}>AI Concierge owner</Text>

          <View style={styles.statsRow}>
            {stats.map((stat) => (
              <View key={stat.label} style={styles.statItem}>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assistant scope</Text>
          <View style={styles.scopeCard}>
            <MaterialIcons name="contacts" size={28} color="#1A73E8" />
            <View style={styles.scopeCopy}>
              <Text style={styles.scopeTitle}>Contacts automation</Text>
              <Text style={styles.scopeText}>
                Commands currently focus on listing latest contacts, identifying people, fetching,
                creating, and deleting contacts.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Permissions</Text>
          {permissions.map((permission) => (
            <View key={permission} style={styles.permissionRow}>
              <MaterialIcons name="check-circle" size={20} color="#34A853" />
              <Text style={styles.permissionText}>{permission}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFF',
  },
  content: {
    padding: 24,
    paddingBottom: 36,
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E8EAED',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 18,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  kicker: {
    color: '#1A73E8',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: '#202124',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.8,
    marginTop: 3,
  },
  smallAvatar: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  smallAvatarText: {
    color: '#1A73E8',
    fontSize: 18,
    fontWeight: '900',
  },
  profileCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 32,
    borderWidth: 1,
    padding: 26,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 42,
    height: 84,
    justifyContent: 'center',
    width: 84,
  },
  avatarText: {
    color: '#1A73E8',
    fontSize: 34,
    fontWeight: '900',
  },
  name: {
    color: '#202124',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 16,
  },
  subtitle: {
    color: '#5F6368',
    fontSize: 15,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
  },
  statItem: {
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
    borderRadius: 18,
    flex: 1,
    padding: 12,
  },
  statValue: {
    color: '#202124',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  statLabel: {
    color: '#80868B',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
  section: {
    marginTop: 26,
  },
  sectionTitle: {
    color: '#202124',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 12,
  },
  scopeCard: {
    alignItems: 'flex-start',
    backgroundColor: '#E8F0FE',
    borderRadius: 26,
    flexDirection: 'row',
    gap: 14,
    padding: 18,
  },
  scopeCopy: {
    flex: 1,
  },
  scopeTitle: {
    color: '#202124',
    fontSize: 17,
    fontWeight: '900',
  },
  scopeText: {
    color: '#5F6368',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 5,
  },
  permissionRow: {
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    padding: 14,
  },
  permissionText: {
    color: '#3C4043',
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});
