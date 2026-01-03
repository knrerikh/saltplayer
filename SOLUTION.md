# Решение проблемы со звуком в MKV с Dolby Digital

## Проблема
Chromium/Electron не поддерживает кодеки AC-3/E-AC-3 (Dolby Digital Plus 5.1) без специальной лицензии.

## Как решает WebTorrent Desktop
1. Пытается воспроизвести через `<video>` элемент
2. Проверяет наличие аудио треков: `mediaElement.audioTracks.length === 0`
3. Если аудио кодек не поддерживается → показывает модальное окно с ошибкой
4. Предлагает открыть видео во внешнем плеере (VLC, mpv, и т.д.)
5. Внешний плеер поддерживает все кодеки → звук работает

## Реализация для Saltplayer

### 1. Добавить проверку аудио треков в VideoPlayer.tsx
```typescript
const handleLoadedMetadata = () => {
  const video = videoRef.current;
  if (!video) return;
  
  // Проверяем наличие аудио треков
  if (video.videoTracks && video.videoTracks.length === 0) {
    setPlaybackError('Video codec unsupported');
  }
  
  if (video.audioTracks && video.audioTracks.length === 0) {
    setPlaybackError('Audio codec unsupported. Try opening in external player.');
  }
};
```

### 2. Добавить кнопку "Open in External Player"
Когда `playbackError` содержит "Audio codec unsupported", показывать кнопку:
- **macOS**: Открывать через QuickTime или VLC
- **Windows**: Открывать через VLC или Windows Media Player
- **Linux**: Открывать через VLC или mpv

### 3. Реализовать IPC для внешнего плеера
Main process:
```typescript
ipcMain.handle('app:openInExternalPlayer', async (_, videoUrl) => {
  // Проверить доступность VLC/mpv
  // Запустить внешний плеер с URL
});
```

### 4. Альтернативные решения

#### Вариант А: Показывать предупреждение при загрузке
При обнаружении MKV с DDP5.1 сразу предупреждать:
"This video may not have audio. Would you like to open in external player?"

#### Вариант Б: Автоматически открывать внешний плеер
Если `audioDecoded === 0` после 3 секунд воспроизведения:
- Остановить встроенный плеер
- Автоматически открыть во внешнем плеере

#### Вариант В: Использовать electron с ffmpeg
Собрать custom Electron с FFmpeg для транскодинга audio на лету.
**Минус**: Сложная сборка, большой размер приложения.

## Рекомендуемый подход
1. Оставить встроенный `<video>` плеер для основного использования
2. Добавить кнопку "Open in External Player" при ошибке аудио
3. Показывать уведомление с инструкциями для пользователя

## Итоговый вывод
WebTorrent Desktop использует **ГИБРИДНЫЙ ПОДХОД**:
- Встроенный плеер для большинства видео
- Внешний плеер (VLC) для файлов с проблемными кодеками

Это лучшее решение - не усложняет архитектуру, но позволяет воспроизводить любые файлы.

