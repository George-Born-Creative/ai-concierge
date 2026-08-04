import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { HEADER_ROW, HEADER_ACTION } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme/theme-provider';
import { Skeleton, SkeletonLines } from '@/components/ui/skeleton';
import { ScreenShell } from '@/components/screen';

type PageSkeletonProps = {
  /** If true, renders a mock header block. Set to false if the page renders its own PageHeader. */
  hasHeader?: boolean;
  /** Title to show in the mock header. */
  title?: string;
};

/**
 * A full-screen skeleton placeholder that matches the app's standard page layout.
 * Used while loading page-level data.
 */
export function PageSkeleton({ hasHeader = true, title }: PageSkeletonProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScreenShell edges={['bottom']}>
      {hasHeader ? (
        <View
          style={[
            styles.header,
            {
              backgroundColor: colors.headerBackground,
              borderBottomColor: colors.border,
              paddingTop: insets.top,
            },
          ]}>
          <View style={styles.headerLeft}>
            <View style={styles.actionButton}>
              <MaterialIcons name="arrow-back" size={24} color={colors.iconMuted} />
            </View>
            {title ? (
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{title}</Text>
            ) : (
              <Skeleton width={120} height={20} radius={6} />
            )}
          </View>
        </View>
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>
        
        {/* Mock Group 1 */}
        <View style={styles.groupContainer}>
          <Skeleton width={90} height={12} radius={4} style={styles.sectionLabel} />
          <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
             <View style={styles.row}>
               <Skeleton width={34} height={34} radius={10} />
               <View style={styles.rowCopy}>
                 <Skeleton width="65%" height={14} radius={4} />
                 <Skeleton width="45%" height={12} radius={4} />
               </View>
             </View>
             <View style={[styles.divider, { backgroundColor: colors.border }]} />
             <View style={styles.row}>
               <Skeleton width={34} height={34} radius={10} />
               <View style={styles.rowCopy}>
                 <Skeleton width="75%" height={14} radius={4} />
                 <Skeleton width="30%" height={12} radius={4} />
               </View>
             </View>
          </View>
        </View>

        {/* Mock Group 2 */}
        <View style={styles.groupContainer}>
          <Skeleton width={110} height={12} radius={4} style={styles.sectionLabel} />
          <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
             <View style={styles.row}>
               <Skeleton width={34} height={34} radius={10} />
               <View style={styles.rowCopy}>
                 <SkeletonLines lines={2} lineHeight={14} gap={6} lastLineWidth="50%" />
               </View>
             </View>
             <View style={[styles.divider, { backgroundColor: colors.border }]} />
             <View style={styles.row}>
               <Skeleton width={34} height={34} radius={10} />
               <View style={styles.rowCopy}>
                 <Skeleton width="80%" height={14} radius={4} />
                 <Skeleton width="60%" height={12} radius={4} />
               </View>
             </View>
             <View style={[styles.divider, { backgroundColor: colors.border }]} />
             <View style={styles.row}>
               <Skeleton width={34} height={34} radius={10} />
               <View style={styles.rowCopy}>
                 <Skeleton width="55%" height={14} radius={4} />
                 <Skeleton width="40%" height={12} radius={4} />
               </View>
             </View>
          </View>
        </View>

      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: {
    height: HEADER_ROW,
    borderBottomWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: HEADER_ACTION,
    height: HEADER_ACTION,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 48,
  },
  groupContainer: {
    marginBottom: 24,
  },
  sectionLabel: {
    marginBottom: 8,
    marginLeft: 4,
    marginTop: 14,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  rowCopy: {
    flex: 1,
    gap: 6,
  },
  divider: {
    height: 1,
    marginLeft: 60,
  },
});
