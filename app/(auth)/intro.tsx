import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Dimensions, StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { Image } from 'expo-image';

import { setCacheItem } from '@/lib/cache';
import { LogoDotsIcon } from '@/components/brand/logo-dots-icon';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    title: 'Your AI voice assistant.',
    subtitle: 'Always ready to help you.',
    image: require('@/assets/images/intro/welcome.png'),
  },
  {
    id: '2',
    title: 'Just Speak',
    subtitle: 'Manage your CRM with your voice.',
    image: require('@/assets/images/intro/voice_control.png'),
  },
  {
    id: '3',
    title: 'Connect & Go',
    subtitle: 'Secure. Smart. Productive.',
    image: require('@/assets/images/intro/connected.png'),
  },
];

export default function IntroScreen() {
  const router = useRouter();
  const scrollX = useSharedValue(0);
  const scrollViewRef = useRef<Animated.ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const handleMomentumScrollEnd = (event: any) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentIndex(index);
  };

  const finishIntro = async () => {
    await setCacheItem('has_seen_intro', 'true');
    router.replace('/signup');
  };

  const nextSlide = () => {
    if (currentIndex < SLIDES.length - 1) {
      scrollViewRef.current?.scrollTo({
        x: width * (currentIndex + 1),
        animated: true,
      });
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={styles.header}>
        <LogoDotsIcon size={48} />
        <Text style={styles.headerTitle}>Welcome</Text>
        <Text style={styles.headerSubtitle}>Discover the new way to manage your CRM and daily tasks effortlessly with AI.</Text>
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
        {SLIDES.map((slide, index) => {
          return (
            <View key={slide.id} style={styles.slide}>
              <View style={styles.imageContainer}>
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
          );
        })}
      </Animated.ScrollView>

      <View style={styles.footer}>
        <View style={styles.pagination}>
          {SLIDES.map((_, index) => {
            const animatedDotStyle = useAnimatedStyle(() => {
              const widthAnimation = interpolate(
                scrollX.value,
                [(index - 1) * width, index * width, (index + 1) * width],
                [10, 24, 10],
                Extrapolation.CLAMP
              );
              
              const opacityAnimation = interpolate(
                scrollX.value,
                [(index - 1) * width, index * width, (index + 1) * width],
                [0.4, 1, 0.4],
                Extrapolation.CLAMP
              );

              return {
                width: widthAnimation,
                opacity: opacityAnimation,
              };
            });

            return (
              <Animated.View
                key={index}
                style={[styles.dot, animatedDotStyle]}
              />
            );
          })}
        </View>

        <View style={styles.buttonContainer}>
          {currentIndex === SLIDES.length - 1 ? (
            <Pressable onPress={finishIntro} style={styles.getStartedBtn}>
              <Text style={styles.getStartedText}>Get Started</Text>
            </Pressable>
          ) : (
            <View style={styles.navRow}>
              <Pressable onPress={finishIntro}>
                <Text style={styles.skipText}>Skip</Text>
              </Pressable>
              <Pressable onPress={nextSlide} style={styles.nextBtn}>
                <Text style={styles.nextText}>Next</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 32,
    marginTop: 20,
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#202124',
    marginTop: 16,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#5F6368',
    textAlign: 'center',
    lineHeight: 22,
  },
  scrollView: {
    flex: 1,
  },
  slide: {
    width,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  imageContainer: {
    width: width * 0.75,
    height: width * 0.75,
    borderRadius: (width * 0.75) / 2,
    overflow: 'hidden',
    marginBottom: 32,
    backgroundColor: 'transparent',
  },
  image: {
    flex: 1,
    width: '100%',
  },
  textContainer: {
    width: '100%',
    padding: 12,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#202124',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#5F6368',
    textAlign: 'center',
    lineHeight: 22,
  },
  footer: {
    position: 'absolute',
    bottom: 50,
    width: '100%',
    paddingHorizontal: 32,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 32,
  },
  dot: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1A73E8',
    marginHorizontal: 4,
  },
  buttonContainer: {
    height: 56,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: '100%',
  },
  skipText: {
    color: '#5F6368',
    fontSize: 16,
    fontWeight: '600',
  },
  nextBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 28,
  },
  nextText: {
    color: '#202124',
    fontSize: 16,
    fontWeight: '600',
  },
  getStartedBtn: {
    backgroundColor: '#1A73E8',
    height: '100%',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  getStartedText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
