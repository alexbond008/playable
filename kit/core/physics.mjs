import RAPIER from "rapier";

export async function createPhysics(stage, { gravity = -9.81 } = {}) {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: gravity, z: 0 });
  const synced = [];
  let acc = 0;
  const STEP = 1 / 120;
  world.timestep = STEP;

  function fixedBox([w, h, d], [x, y, z], opts = {}) {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
    world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setFriction(opts.friction ?? 0.8), body);
    return body;
  }

  function fixedCylinder(r, h, [x, y, z], opts = {}) {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
    world.createCollider(RAPIER.ColliderDesc.cylinder(h / 2, r).setFriction(opts.friction ?? 0.8), body);
    return body;
  }

  function kinematic(colliderDesc, [x, y, z]) {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z));
    world.createCollider(colliderDesc, body);
    return body;
  }

  function dynamicCylinder(target, r, h, [x, y, z], { mass = 0.4, friction = 0.9, restitution = 0.05 } = {}) {
    const mesh = target;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setCcdEnabled(true).setLinearDamping(0.2).setAngularDamping(0.6));
    const desc = RAPIER.ColliderDesc.cylinder(h / 2, r).setFriction(friction).setRestitution(restitution).setMass(mass);
    world.createCollider(desc, body);
    synced.push({ mesh, body });
    return body;
  }

  function sync() {
    for (const { mesh, body } of synced) {
      const t = body.translation();
      const q = body.rotation();
      mesh.position.set(t.x, t.y, t.z);
      mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
  }

  function step(dt) {
    acc += Math.min(dt, 0.1);
    let n = 0;
    while (acc >= STEP && n < 8) {
      world.step();
      acc -= STEP;
      n++;
    }
    sync();
  }

  return { RAPIER, world, fixedBox, fixedCylinder, kinematic, dynamicCylinder, step, sync };
}
