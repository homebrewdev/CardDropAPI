import type { CapacitorConfig } from "@capacitor/cli";

// Android-клиент CardDrop. Игра — та же сборка фронта (dist), адрес
// игрового сервера задаётся в приложении полем «⚙ Сервер» на главном окне
// или при сборке: VITE_SERVER_URL=http://192.168.1.10:8000 npm run build
const config: CapacitorConfig = {
  appId: "com.carddrop.app",
  appName: "CardDrop",
  webDir: "dist",
  server: {
    // Страница приложения открывается как http://localhost, а не https:
    // иначе запросы к серверу по http://<IP> блокируются как смешанный
    // контент. Для публикации с HTTPS-сервером это нужно убрать.
    androidScheme: "http",
    // Разрешить незашифрованные http/ws подключения (сервер в локальной сети)
    cleartext: true,
  },
};

export default config;
