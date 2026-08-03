import * as THREE from "three";

/**
 * Cute chibi CatDog from Vampire Ducks v1 — procedural low-poly mesh.
 * Local origin is roughly body centre (matches previous capsule placement).
 */
export function createCatDogMesh(scale = 0.95): THREE.Group {
  const s = scale;
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.52 * s, 0.55 * s, 6, 10),
    new THREE.MeshStandardMaterial({ color: 0xffb366, roughness: 0.85, flatShading: true }),
  );
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.5 * s, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0xffcc88, roughness: 0.85, flatShading: true }),
  );
  head.position.y = 1.0 * s;
  head.castShadow = true;
  group.add(head);

  const earGeo = new THREE.ConeGeometry(0.2 * s, 0.4 * s, 6);
  const earMat = new THREE.MeshStandardMaterial({ color: 0xffaa55, roughness: 0.85, flatShading: true });
  const earL = new THREE.Mesh(earGeo, earMat);
  earL.position.set(-0.3 * s, 1.42 * s, 0);
  earL.rotation.z = 0.35;
  earL.castShadow = true;
  group.add(earL);
  const earR = earL.clone();
  earR.position.x = 0.3 * s;
  earR.rotation.z = -0.35;
  group.add(earR);

  const innerEarGeo = new THREE.ConeGeometry(0.1 * s, 0.22 * s, 5);
  const innerEarMat = new THREE.MeshStandardMaterial({ color: 0xffaaaa, roughness: 0.85, flatShading: true });
  const innerL = new THREE.Mesh(innerEarGeo, innerEarMat);
  innerL.position.set(-0.3 * s, 1.4 * s, 0.02);
  innerL.rotation.z = 0.35;
  group.add(innerL);
  const innerR = innerL.clone();
  innerR.position.x = 0.3 * s;
  innerR.rotation.z = -0.35;
  group.add(innerR);

  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, flatShading: true });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.13 * s, 8, 6), eyeWhiteMat);
  eyeL.position.set(-0.18 * s, 1.08 * s, 0.4 * s);
  group.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.18 * s;
  group.add(eyeR);

  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7, flatShading: true });
  const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.07 * s, 6, 5), pupilMat);
  pupilL.position.set(-0.18 * s, 1.08 * s, 0.5 * s);
  group.add(pupilL);
  const pupilR = pupilL.clone();
  pupilR.position.x = 0.18 * s;
  group.add(pupilR);

  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.12 * s, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a2211, roughness: 0.8, flatShading: true }),
  );
  nose.position.set(0, 0.95 * s, 0.48 * s);
  group.add(nose);

  const mouth = new THREE.Mesh(
    new THREE.TorusGeometry(0.1 * s, 0.025 * s, 6, 10, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x552211, roughness: 0.8, flatShading: true }),
  );
  mouth.position.set(0, 0.82 * s, 0.45 * s);
  mouth.rotation.x = Math.PI;
  group.add(mouth);

  const pawMat = new THREE.MeshStandardMaterial({ color: 0xffaa66, roughness: 0.85, flatShading: true });
  const pawGeo = new THREE.SphereGeometry(0.18 * s, 8, 6);
  const pawFL = new THREE.Mesh(pawGeo, pawMat);
  pawFL.position.set(-0.35 * s, -0.55 * s, 0.25 * s);
  pawFL.scale.set(1, 0.7, 1.2);
  pawFL.castShadow = true;
  group.add(pawFL);
  const pawFR = pawFL.clone();
  pawFR.position.x = 0.35 * s;
  group.add(pawFR);
  const pawBL = pawFL.clone();
  pawBL.position.set(-0.3 * s, -0.55 * s, -0.3 * s);
  group.add(pawBL);
  const pawBR = pawFL.clone();
  pawBR.position.set(0.3 * s, -0.55 * s, -0.3 * s);
  group.add(pawBR);

  const tail = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.08 * s, 0.5 * s, 4, 6),
    new THREE.MeshStandardMaterial({ color: 0xffb366, roughness: 0.85, flatShading: true }),
  );
  tail.position.set(0, 0.1 * s, -0.55 * s);
  tail.rotation.x = 0.6;
  tail.castShadow = true;
  group.add(tail);

  return group;
}
