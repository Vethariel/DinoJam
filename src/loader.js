import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Y minimo de la geometria en espacio local (accessor POSITION del GLB).
// Constante: no cambia con animaciones.
const GEO_MIN_Y_LOCAL = -2.0147;

export function loadTRex(scene, controls, camera, { onProgress } = {}) {
  return new Promise((resolve, reject) => {

    const loader = new GLTFLoader();

    // KHR_materials_pbrSpecularGlossiness:
    // Mapeamos diffuseTexture -> map (color base).
    // Ignoramos specularGlossinessTexture: causa parpadeos en MeshStandardMaterial.
    loader.register((parser) => ({
      name: 'KHR_materials_pbrSpecularGlossiness',

      async extendMaterialParams(materialIndex, materialParams) {
        const matDef = parser.json.materials?.[materialIndex];
        const ext = matDef?.extensions?.KHR_materials_pbrSpecularGlossiness;
        if (!ext) return;

        if (ext.diffuseTexture !== undefined) {
          const tex = await parser.getDependency('texture', ext.diffuseTexture.index);
          if (tex) {
            tex.colorSpace = THREE.SRGBColorSpace;
            materialParams.map = tex;
          }
        }
        if (ext.diffuseFactor) {
          materialParams.color = new THREE.Color(
            ext.diffuseFactor[0], ext.diffuseFactor[1], ext.diffuseFactor[2]
          );
        }

        materialParams.metalness = 0.0;
        materialParams.roughness = ext.glossinessFactor !== undefined
          ? 1.0 - ext.glossinessFactor
          : 0.75;
      },
    }));

    loader.load(
      'T-Rex.glb',

      (gltf) => {
        const model = gltf.scene;

        // Escala
        const boxLocal = new THREE.Box3().setFromObject(model);
        const sizeLocal = boxLocal.getSize(new THREE.Vector3());
        const maxDim = Math.max(sizeLocal.x, sizeLocal.y, sizeLocal.z);
        const ourScale = 5 / maxDim;
        model.scale.setScalar(ourScale);

        // Y estable: geometria cruda * rootScale(0.01) * ourScale
        const minYWorld = GEO_MIN_Y_LOCAL * 0.01 * ourScale;

        // Centrar X/Z
        model.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(model);
        const cx = (box.min.x + box.max.x) / 2;
        const cz = (box.min.z + box.max.z) / 2;
        model.position.set(-cx, -minYWorld, -cz);

        // Traverse: sombras + fix materiales
        model.traverse((obj) => {
          if (!obj.isMesh) return;
          obj.castShadow    = true;
          obj.receiveShadow = true;

          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) {
            if (!mat) continue;

            // Fix metalness/roughness defaults incorrectos del GLB
            if (mat.metalness > 0.1 && !mat.metalnessMap) mat.metalness = 0.0;
            if (mat.roughness > 0.95 && !mat.roughnessMap) mat.roughness = 0.75;

            // roughnessMap sin metalnessMap = specGloss mal mapeado, limpiar
            if (mat.roughnessMap && !mat.metalnessMap) mat.roughnessMap = null;

            // Fix parpadeos de geometria (z-fighting por normales del modelo).
            // polygonOffset empuja las faces hacia la camara sin tocar el GLB.
            mat.polygonOffset       = true;
            mat.polygonOffsetFactor = -1;
            mat.polygonOffsetUnits  = -1;

            for (const key of ['map', 'emissiveMap']) {
              if (mat[key]) mat[key].colorSpace = THREE.SRGBColorSpace;
            }
            mat.needsUpdate = true;
          }
        });

        scene.add(model);

        // Camara
        model.updateWorldMatrix(true, true);
        const finalBox    = new THREE.Box3().setFromObject(model);
        const finalCenter = finalBox.getCenter(new THREE.Vector3());
        controls.target.copy(finalCenter);
        camera.position.set(finalCenter.x, finalCenter.y + 1, finalCenter.z + 10);
        controls.update();

        resolve({ model, clips: gltf.animations });
      },

      (xhr) => {
        if (xhr.lengthComputable && onProgress) {
          onProgress(Math.round((xhr.loaded / xhr.total) * 100));
        }
      },

      reject
    );
  });
}