export default function WatermelonHero({ slicePhase }) {
  return (
    <div className={`welcome-art phase-${slicePhase}`} aria-hidden="true">
      <div className="hero-fruit-shadow" />
      <div className="hero-watermelon hero-watermelon-whole">
        <span className="hero-rind" />
        <span className="hero-rind-highlight" />
      </div>
      <div className="hero-watermelon hero-watermelon-cut">
        <span className="hero-rind" />
        <span className="hero-pith" />
        <span className="hero-flesh" />
        <span className="hero-seeds"><i /><i /><i /><i /><i /><i /><i /></span>
      </div>
      <div className="hero-juice-splash"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
      <div className="hero-knife"><span className="hero-knife-blade" /><span className="hero-knife-handle" /></div>
      <span className="hero-seed-flight seed-flight-one" />
      <span className="hero-seed-flight seed-flight-two" />
      <span className="hero-seed-flight seed-flight-three" />
    </div>
  );
}
