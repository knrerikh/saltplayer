# Решение проблемы с патентованными кодеками в Electron

## ⚠️ ВАЖНО: Юридические аспекты

Использование патентованных кодеков (AC-3, E-AC-3, H.264) **требует лицензии** от правообладателей:
- **Dolby Digital (AC-3/E-AC-3)**: Лицензия Dolby Laboratories
- **H.264**: Лицензия MPEG LA

**Для коммерческого использования**: Нужно купить лицензии (~$10,000-50,000/год)

**Для личного использования**: Находится в серой зоне (обычно не преследуется, но технически незаконно)

---

## Технические решения

### 1. Замена libffmpeg (самый простой способ)

#### Установка готовой libffmpeg с кодеками:

```bash
# Установить пакет
npm install --save-dev @castlabs/electron-releases

# Или для старых версий Electron
npm install --save-dev electron-ffmpeg
```

#### Автоматическая замена при сборке:

Добавить в `package.json`:

```json
{
  "build": {
    "afterPack": "./build/replace-ffmpeg.js"
  }
}
```

Создать `build/replace-ffmpeg.js`:

```javascript
const fs = require('fs');
const path = require('path');

module.exports = async function(context) {
  const { appOutDir, electronPlatformName } = context;
  
  const ffmpegPaths = {
    darwin: 'Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib',
    win32: 'ffmpeg.dll',
    linux: 'libffmpeg.so'
  };
  
  const sourcePath = path.join(__dirname, '../ffmpeg', electronPlatformName, ffmpegPaths[electronPlatformName]);
  const targetPath = path.join(appOutDir, ffmpegPaths[electronPlatformName]);
  
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, targetPath);
    console.log('✓ Replaced ffmpeg with full codec support');
  }
};
```

#### Где взять libffmpeg:

1. **Castlabs (рекомендуется)**: https://github.com/castlabs/electron-releases
   - Официальные сборки Electron с кодеками
   - Регулярно обновляется
   
2. **Самостоятельная сборка**:
   ```bash
   git clone https://github.com/electron/electron
   cd electron
   # Изменить args.gn: ffmpeg_branding = "Chrome"
   npm run build
   ```

3. **Сторонние репозитории** (рискованно):
   - https://github.com/iteufel/electron-ffmpeg
   - Проверяйте на вирусы!

---

### 2. Использование Electron от Castlabs (легальнее)

Castlabs предоставляет Electron с поддержкой DRM и кодеков:

```bash
npm install --save-dev @castlabs/electron-releases
```

Изменить `package.json`:

```json
{
  "devDependencies": {
    "electron": "npm:@castlabs/electron-releases@28.1.0+11"
  }
}
```

**Плюсы:**
- Официальная сборка
- Регулярные обновления
- Включает Widevine DRM

**Минусы:**
- Все равно нужна лицензия для коммерческого использования
- Больший размер приложения

---

### 3. Использование внешней библиотеки для декодирования

Вместо замены FFmpeg использовать отдельную библиотеку:

```bash
npm install fluent-ffmpeg ffmpeg-static
```

Декодировать аудио "на лету" через Node.js:

```typescript
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

ffmpeg.setFfmpegPath(ffmpegPath);

// Транскодировать аудио из AC-3 в AAC перед отправкой в браузер
ffmpeg(inputStream)
  .audioCodec('aac')
  .format('mp4')
  .pipe(outputStream);
```

**Минусы:**
- Дополнительная нагрузка на CPU
- Задержка при транскодировании
- Сложность реализации для streaming

---

## Рекомендуемый подход для Saltplayer

### Для разработки (личное использование):

1. Использовать **Castlabs Electron**:
   ```bash
   npm install --save-dev electron@npm:@castlabs/electron-releases@latest
   ```

2. Пересобрать приложение:
   ```bash
   rm -rf node_modules dist
   npm install
   npm run dev
   ```

### Для публикации (коммерческое):

**Легальный путь:**
1. Оставить fallback на VLC/mpv для проблемных кодеков
2. Показывать уведомление пользователю о необходимости внешнего плеера
3. Не включать патентованные кодеки в дистрибутив

**Альтернатива:**
- Купить лицензию у Dolby и MPEG LA
- Использовать Castlabs с правильной лицензией

---

## Сравнение решений

| Решение | Сложность | Стоимость | Легальность |
|---------|-----------|-----------|-------------|
| Замена libffmpeg | Низкая | Бесплатно | ⚠️ Серая зона |
| Castlabs Electron | Низкая | Бесплатно* | ⚠️ Серая зона |
| Транскодинг FFmpeg | Высокая | Бесплатно | ⚠️ Серая зона |
| Внешний плеер (VLC) | Средняя | Бесплатно | ✅ Легально |
| Покупка лицензий | Низкая | $10k-50k/год | ✅ Легально |

\* Для коммерческого использования нужна лицензия

---

## Мой вердикт

Для **личного/некоммерческого проекта**:
- Попробовать Castlabs Electron (просто заменить в package.json)

Для **публичного/коммерческого проекта**:
- Использовать fallback на внешний плеер (VLC/mpv)
- Это решение WebTorrent Desktop, и оно **полностью легально**

---

## Быстрый тест: Castlabs Electron

Хотите попробовать прямо сейчас?

```bash
cd /Users/k/Repos/saltplayer
npm install --save-dev @castlabs/electron-releases
rm -rf dist node_modules/.cache
npm run dev
```

Если после этого звук заработает - значит проблема была именно в кодеках FFmpeg.

