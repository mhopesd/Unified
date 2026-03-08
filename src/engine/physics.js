// Minimal 2D physics — velocity, friction, AABB collision

export function applyVelocity(entity, dt) {
  entity.x += entity.vx * dt;
  entity.y += entity.vy * dt;
}

export function applyFriction(entity, friction, dt) {
  const factor = Math.pow(friction, dt);
  entity.vx *= factor;
  entity.vy *= factor;
  // Stop tiny velocities
  if (Math.abs(entity.vx) < 0.5) entity.vx = 0;
  if (Math.abs(entity.vy) < 0.5) entity.vy = 0;
}

// Axis-Aligned Bounding Box overlap test
export function aabbOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

// Resolve entity vs static rectangle — push entity out
export function resolveCollision(entity, solid) {
  const overlapX = Math.min(
    entity.x + entity.w - solid.x,
    solid.x + solid.w - entity.x
  );
  const overlapY = Math.min(
    entity.y + entity.h - solid.y,
    solid.y + solid.h - entity.y
  );

  if (overlapX < overlapY) {
    // Push along X
    if (entity.x + entity.w / 2 < solid.x + solid.w / 2) {
      entity.x -= overlapX;
    } else {
      entity.x += overlapX;
    }
    entity.vx = 0;
  } else {
    // Push along Y
    if (entity.y + entity.h / 2 < solid.y + solid.h / 2) {
      entity.y -= overlapY;
    } else {
      entity.y += overlapY;
    }
    entity.vy = 0;
  }
}
