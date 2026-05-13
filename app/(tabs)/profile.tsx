import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

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

const securityItems = [
  'Microphone access is requested only when recording starts.',
  'Contact permissions stay limited to assistant contact commands.',
  'Voice recordings are sent only after you release the mic.',
];

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.screen}>
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          <View style={styles.securityCard}>
            <View style={styles.securityIcon}>
              <MaterialIcons name="security" size={28} color="#1A73E8" />
            </View>
            <View style={styles.securityCopy}>
              <Text style={styles.securityTitle}>Privacy first assistant</Text>
              {securityItems.map((item) => (
                <View key={item} style={styles.securityItem}>
                  <MaterialIcons name="verified-user" size={18} color="#34A853" />
                  <Text style={styles.securityText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.actionsSection}>
          <Pressable
            style={styles.actionButton}
            onPress={() => Alert.alert('Settings', 'Settings screen can be connected here.')}>
            <View style={styles.actionIcon}>
              <MaterialIcons name="settings" size={22} color="#1A73E8" />
            </View>
            <View style={styles.actionCopy}>
              <Text style={styles.actionTitle}>Settings</Text>
              <Text style={styles.actionDescription}>Manage assistant preferences</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#9AA0A6" />
          </Pressable>

          <Pressable
            style={[styles.actionButton, styles.logoutButton]}
            onPress={() => Alert.alert('Logout', 'Logout action can be connected here.')}>
            <View style={[styles.actionIcon, styles.logoutIcon]}>
              <MaterialIcons name="logout" size={22} color="#EA4335" />
            </View>
            <View style={styles.actionCopy}>
              <Text style={[styles.actionTitle, styles.logoutTitle]}>Logout</Text>
              <Text style={styles.actionDescription}>Sign out of AI-Concierge</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#F6AEA9" />
          </Pressable>
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
    paddingBottom: 120,
    paddingTop: 30,
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
  securityCard: {
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 18,
  },
  securityIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  securityCopy: {
    flex: 1,
  },
  securityTitle: {
    color: '#202124',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 12,
  },
  securityItem: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 9,
    marginBottom: 10,
  },
  securityText: {
    color: '#5F6368',
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  actionsSection: {
    gap: 12,
    marginTop: 30,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 16,
  },
  logoutButton: {
    borderColor: '#FAD2CF',
  },
  actionIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  logoutIcon: {
    backgroundColor: '#FCE8E6',
  },
  actionCopy: {
    flex: 1,
  },
  actionTitle: {
    color: '#202124',
    fontSize: 16,
    fontWeight: '900',
  },
  logoutTitle: {
    color: '#EA4335',
  },
  actionDescription: {
    color: '#5F6368',
    fontSize: 13,
    marginTop: 3,
  },
});
