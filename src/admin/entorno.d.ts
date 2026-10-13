interface ImportMetaEnv {
  readonly PUBLIC_FIREBASE_CONFIG?: string;
  readonly PUBLIC_RECAPTCHA_V3?: string;
  readonly PUBLIC_EMULADOR?: string;
  readonly PUBLIC_CLOUDINARY_NUBE?: string;
  readonly PUBLIC_CLOUDINARY_PRESET?: string;
  readonly PUBLIC_URL_PUBLICAR?: string;
}

declare module "*.md?raw" {
  const texto: string;
  export default texto;
}
