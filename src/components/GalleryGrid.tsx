/* eslint-disable @next/next/no-img-element */
export default function GalleryGrid() {
  const files = Array.from({ length: 12 }).map((_, i) => `/gallery/${i + 1}.jpg`);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {files.map((src) => (
        <div key={src} className="aspect-square overflow-hidden rounded-lg border bg-white">
          <img
            src={src}
            alt="Dipsgiving"
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src =
                "data:image/svg+xml;utf8," +
                encodeURIComponent(
                  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><rect width='100%' height='100%' fill='#fff4ea'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#cc7a00' font-family='sans-serif' font-size='18'>Add images to /public/gallery</text></svg>`
                );
            }}
          />
        </div>
      ))}
    </div>
  );
}
