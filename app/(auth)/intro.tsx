import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LogoDotsIcon } from '@/components/brand/logo-dots-icon';
import {
  UiControlHeights,
  UiRadii,
  UiSpacing,
  UiTypography,
} from '@/constants/theme';
import { setCacheItem } from '@/lib/cache';

const SLIDES = [
  {
    id: '1',
    title: 'Your AI voice assistant.',
    subtitle: 'Always ready to help you.',
    image: require('@/assets/images/intro/welcome.jpg'),
  },
  {
    id: '2',
    title: 'Just Speak',
    subtitle: 'Manage your CRM with your voice.',
    image: require('@/assets/images/intro/voice_control.jpg'),
  },
  {
    id: '3',
    title: 'Connect & Go',
    subtitle: 'Secure. Smart. Productive.',
    image: require('@/assets/images/intro/connected.jpg'),
  },
];

export default function IntroScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pageWidth = Math.max(width, 1);
  const mediaSize = Math.min(pageWidth * 0.72, 380);
  const scrollX = useSharedValue(0);
  const scrollViewRef = useRef<Animated.ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const handleMomentumScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const index = Math.round(
      event.nativeEvent.contentOffset.x / pageWidth,
    );
    setCurrentIndex(index);
  };

  const finishIntro = async () => {
    await setCacheItem('has_seen_intro', 'true');
    router.replace('/signup');
  };

  const nextSlide = () => {
    if (currentIndex < SLIDES.length - 1) {
      scrollViewRef.current?.scrollTo({
        x: pageWidth * (currentIndex + 1),
        animated: true,
      });
    }
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: Math.max(insets.top + UiSpacing.md, UiSpacing.xxxl) },
      ]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <LogoDotsIcon size={44} />
        <Text style={styles.headerTitle}>Welcome</Text>
        <Text style={styles.headerSubtitle}>
          Discover the new way to manage your CRM and daily tasks effortlessly
          with AI.
        </Text>
      </View>

      <Animated.ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        style={styles.scrollView}
      >
        {SLIDES.map((slide) => (
          <View
            key={slide.id}
            style={[styles.slide, { width: pageWidth }]}>
            <View
              style={[
                styles.imageContainer,
                {
                  borderRadius: mediaSize / 2,
                  height: mediaSize,
                  width: mediaSize,
                },
              ]}>
              <Image
                source={slide.image}
                style={styles.image}
                contentFit="cover"
                transition={500}
              />
            </View>

            <View style={styles.textContainer}>
              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.subtitle}>{slide.subtitle}</Text>
            </View>
          </View>
        ))}
      </Animated.ScrollView>

      <View
        style={[
          styles.footer,
          { bottom: Math.max(insets.bottom + UiSpacing.md, UiSpacing.xl) },
        ]}>
        <View style={styles.pagination}>
          {SLIDES.map((slide, index) => (
            <PaginationDot
              key={slide.id}
              index={index}
              pageWidth={pageWidth}
              scrollX={scrollX}
            />
          ))}
        </View>

        <View style={styles.buttonContainer}>
          {currentIndex === SLIDES.length - 1 ? (
            <Pressable
              accessibilityRole="button"
              onPress={finishIntro}
              style={styles.getStartedBtn}>
              <Text style={styles.getStartedText}>Get Started</Text>
            </Pressable>
          ) : (
            <View style={styles.navRow}>
              <Pressable
                accessibilityRole="button"
                hitSlop={UiSpacing.sm}
                onPress={finishIntro}
                style={styles.skipButton}>
                <Text style={styles.skipText}>Skip</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={nextSlide}
                style={styles.nextBtn}>
                <Text style={styles.nextText}>Next</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function PaginationDot({
  index,
  pageWidth,
  scrollX,
}: {
  index: number;
  pageWidth: number;
  scrollX: SharedValue<number>;
}) {
  const animatedDotStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * pageWidth,
      index * pageWidth,
      (index + 1) * pageWidth,
    ];
    return {
      width: interpolate(
        scrollX.value,
        inputRange,
        [8, 20, 8],
        Extrapolation.CLAMP,
      ),
      opacity: interpolate(
        scrollX.value,
        inputRange,
        [0.4, 1, 0.4],
        Extrapolation.CLAMP,
      ),
    };
  });

  return <Animated.View style={[styles.dot, animatedDotStyle]} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    alignItems: 'center',
    marginBottom: UiSpacing.sm,
    paddingHorizontal: UiSpacing.xxl,
  },
  headerTitle: {
    color: '#202124',
    fontSize: UiTypography.pageTitle.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.pageTitle.lineHeight,
    marginBottom: UiSpacing.xs,
    marginTop: UiSpacing.md,
  },
  headerSubtitle: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    maxWidth: 420,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 88,
    paddingHorizontal: UiSpacing.xxl,
  },
  imageContainer: {
    backgroundColor: 'transparent',
    marginBottom: UiSpacing.xxl,
    overflow: 'hidden',
  },
  image: {
    flex: 1,
    width: '100%',
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: UiSpacing.sm,
    width: '100%',
  },
  title: {
    color: '#202124',
    fontSize: UiTypography.sectionHeading.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.sectionHeading.lineHeight,
    marginBottom: UiSpacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: UiSpacing.xxl,
    position: 'absolute',
    width: '100%',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: UiSpacing.xl,
  },
  dot: {
    backgroundColor: '#1A73E8',
    borderRadius: UiRadii.pill,
    height: 8,
    marginHorizontal: 4,
  },
  buttonContainer: {
    height: UiControlHeights.button,
  },
  navRow: {
    alignItems: 'center',
    flexDirection: 'row',
    height: '100%',
    justifyContent: 'space-between',
  },
  skipButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: UiControlHeights.button,
    paddingHorizontal: UiSpacing.xs,
  },
  skipText: {
    color: '#5F6368',
    fontSize: UiTypography.button.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.button.lineHeight,
  },
  nextBtn: {
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: UiRadii.control,
    height: UiControlHeights.button,
    justifyContent: 'center',
    paddingHorizontal: UiSpacing.xxl,
  },
  nextText: {
    color: '#202124',
    fontSize: UiTypography.button.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.button.lineHeight,
  },
  getStartedBtn: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: UiRadii.control,
    height: '100%',
    justifyContent: 'center',
  },
  getStartedText: {
    color: '#FFFFFF',
    fontSize: UiTypography.button.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.button.lineHeight,
  },
});
