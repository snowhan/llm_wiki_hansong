/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WPS_GATEWAY_URL: string
  readonly VITE_WPS_GATEWAY_UID: string
  readonly VITE_WPS_GATEWAY_PRODUCT_NAME: string
  readonly VITE_WPS_GATEWAY_TOKEN: string
  readonly VITE_WPS_GATEWAY_MODEL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
