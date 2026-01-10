import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white overflow-hidden relative">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_-20%,_#3b0764,_#000000_60%)] z-0" />

      <div className="z-10 text-center space-y-8 p-4">
        <h1 className="text-6xl md:text-8xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-600 drop-shadow-2xl">
          FINANCES<br />GAME
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto font-light">
          Experience the thrill of trading, auctions, and strategy in a real-time multiplayer economy.
        </p>

        <div className="flex flex-col sm:flex-row gap-6 justify-center mt-12">
          <Link
            href="/login"
            className="px-8 py-4 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(255,255,255,0.3)]"
          >
            Start Playing
          </Link>
          <Link
            href="/register"
            className="px-8 py-4 border border-white/20 bg-white/5 backdrop-blur-lg text-white font-bold rounded-full hover:bg-white/10 transition-all transform hover:scale-105"
          >
            Create Account
          </Link>
        </div>
      </div>

      {/* Floating Elements Animation (Simplified CSS) */}
      <div className="absolute bottom-0 w-full h-1/3 bg-gradient-to-t from-black to-transparent z-10 pointer-events-none" />
    </div>
  );
}
