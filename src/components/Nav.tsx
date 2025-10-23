"use client";

export default function Nav() {
  const link =
    "text-sm px-3 py-1 rounded-full hover:bg-orange-100 text-orange-800";
  return (
    <header className="sticky top-0 z-40 backdrop-blur bg-white/60 border-b border-orange-100">
      <nav className="mx-auto max-w-5xl flex items-center justify-between p-4">
        <a href="#" className="font-extrabold text-2xl text-orange-800">
          Dipsgiving
        </a>
        <div className="flex gap-2">
          <a className={link} href="#about">About</a>
          <a className={link} href="#gallery">Gallery</a>
          <a className={link} href="#signup">Sign up</a>
          <a className={link} href="#vote">Vote</a>
        </div>
      </nav>
    </header>
  );
}
