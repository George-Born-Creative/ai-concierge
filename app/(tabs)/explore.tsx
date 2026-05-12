import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAssistantHistory } from '@/lib/assistant-history';

export default function HistoryScreen() {
  const { clearHistory, history } = useAssistantHistory();

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>History</Text>
            <Text style={styles.title}>Commands and responses</Text>
          </View>
          <View style={styles.historyCount}>
            <Text style={styles.historyCountText}>{history.length}</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          Review every command, the transcribed text, and the response returned by the assistant.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          <Pressable disabled={history.length === 0} onPress={clearHistory}>
            <Text style={[styles.sectionAction, history.length === 0 && styles.disabledAction]}>
              Clear
            </Text>
          </Pressable>
        </View>

        {history.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialIcons name="history" size={34} color="#1A73E8" />
            <Text style={styles.emptyTitle}>No history yet</Text>
            <Text style={styles.emptyText}>
              Commands you run from the chat page will appear here with their responses.
            </Text>
          </View>
        ) : (
          history.map((entry) => (
            <View key={entry.id} style={styles.taskCard}>
              <View
                style={[
                  styles.taskIcon,
                  { backgroundColor: entry.status === 'success' ? '#34A853' : '#EA4335' },
                ]}>
                <MaterialIcons
                  name={entry.source === 'voice' ? 'mic' : 'keyboard'}
                  size={23}
                  color="#FFFFFF"
                />
              </View>
              <View style={styles.taskCopy}>
                <Text style={styles.taskTitle}>{entry.command}</Text>
                <Text style={styles.taskDescription}>{entry.response}</Text>
                <Text style={styles.timestamp}>{formatTimestamp(entry.createdAt)}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
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
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E8EAED',
    borderBottomWidth: 1,
    paddingBottom: 18,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
  },
  headerCopy: {
    flex: 1,
  },
  historyCount: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  historyCountText: {
    color: '#1A73E8',
    fontSize: 18,
    fontWeight: '900',
  },
  kicker: {
    color: '#1A73E8',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#202124',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  subtitle: {
    color: '#5F6368',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#202124',
    fontSize: 20,
    fontWeight: '800',
  },
  sectionAction: {
    color: '#1A73E8',
    fontSize: 14,
    fontWeight: '800',
  },
  disabledAction: {
    color: '#BDC1C6',
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 26,
    borderWidth: 1,
    padding: 26,
  },
  emptyTitle: {
    color: '#202124',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 12,
  },
  emptyText: {
    color: '#5F6368',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
    textAlign: 'center',
  },
  taskCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    elevation: 2,
    flexDirection: 'row',
    gap: 16,
    marginBottom: 14,
    padding: 16,
    shadowColor: '#3C4043',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
  },
  taskIcon: {
    alignItems: 'center',
    borderRadius: 20,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  taskCopy: {
    flex: 1,
  },
  taskTitle: {
    color: '#202124',
    fontSize: 17,
    fontWeight: '800',
  },
  taskDescription: {
    color: '#5F6368',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  timestamp: {
    color: '#80868B',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },
});
