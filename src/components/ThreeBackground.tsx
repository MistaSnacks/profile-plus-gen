import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export const ThreeBackground = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    const renderer = new THREE.WebGLRenderer({ 
      alpha: true, 
      antialias: true 
    });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    mountRef.current.appendChild(renderer.domElement);

    camera.position.z = 8;

    // Subtle, dark wireframe shapes
    const geometries = [
      new THREE.TorusGeometry(2, 0.3, 12, 80),
      new THREE.OctahedronGeometry(1.5),
      new THREE.IcosahedronGeometry(1.2),
    ];

    const materials = [
      new THREE.MeshBasicMaterial({ 
        color: 0xc2528b, 
        wireframe: true,
        transparent: true,
        opacity: 0.12
      }),
      new THREE.MeshBasicMaterial({ 
        color: 0x4d9da0, 
        wireframe: true,
        transparent: true,
        opacity: 0.08
      }),
      new THREE.MeshBasicMaterial({ 
        color: 0x7a5bb5, 
        wireframe: true,
        transparent: true,
        opacity: 0.06
      }),
    ];

    const meshes = geometries.map((geo, i) => {
      const mesh = new THREE.Mesh(geo, materials[i]);
      mesh.position.x = (i - 1) * 4;
      mesh.position.y = (Math.random() - 0.5) * 3;
      mesh.position.z = -2 - i;
      scene.add(mesh);
      return mesh;
    });

    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);

      meshes.forEach((mesh, i) => {
        mesh.rotation.x += 0.0005 * (i + 1);
        mesh.rotation.y += 0.001 * (i + 1);
        mesh.position.y += Math.sin(Date.now() * 0.0003 + i) * 0.0005;
      });

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      mountRef.current?.removeChild(renderer.domElement);
      geometries.forEach(geo => geo.dispose());
      materials.forEach(mat => mat.dispose());
    };
  }, []);

  return (
    <div 
      ref={mountRef} 
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.4 }}
    />
  );
};
