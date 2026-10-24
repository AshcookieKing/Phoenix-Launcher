import { useMemo } from 'react';

// Фон: арт Войн клонов + затемнение под интерфейс + поднимающиеся искры пламени Phoenix
export default function Background({ animated }) {
  const embers = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        id: i,
        left: `${(i * 37 + 11) % 100}%`,
        size: 2 + ((i * 7) % 4),
        delay: `${-((i * 1.37) % 9).toFixed(2)}s`,
        duration: `${7 + ((i * 3) % 7)}s`,
        drift: `${((i % 5) - 2) * 18}px`,
      })),
    []
  );

  return (
    <div className="bg" aria-hidden>
      <div className="bg-art" style={{ backgroundImage: "url(./assets/background.jpg)" }} />
      <div className="bg-shade" />
      <div className="bg-heat" />
      {animated && (
        <div className="embers">
          {embers.map((e) => (
            <span
              key={e.id}
              style={{
                left: e.left,
                width: e.size,
                height: e.size,
                animationDelay: e.delay,
                animationDuration: e.duration,
                '--drift': e.drift,
              }}
            />
          ))}
        </div>
      )}
      <div className="bg-vignette" />
    </div>
  );
}
