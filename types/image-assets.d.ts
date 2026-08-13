// Allow importing animated image assets (e.g. `.gif`) as module ids so they
// can be passed to <Image source={...} /> via a static import.
declare module "*.gif" {
  const source: number;
  export default source;
}
