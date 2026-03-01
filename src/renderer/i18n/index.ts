import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ko from './ko';

/**
 * Initialize i18n with Korean as default language
 */
i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
  },
  lng: 'ko',
  fallbackLng: 'ko',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
