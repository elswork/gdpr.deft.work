# gdpr.deft.work // Sistema de Recogida y Custodia de Datos Bajo Cero Conocimiento

Este repositorio contiene la arquitectura técnica del nodo **gdpr.deft.work**, un sistema diseñado específicamente para la recopilación, almacenamiento y gestión segura de datos sensibles de registro destinados a la **Iniciativa Ciudadana Europea (ICE) Anticitera**. 

La arquitectura implementa el principio de **Privacidad por Diseño (Privacy by Design)** y el paradigma de **Conocimiento Cero (Zero-Knowledge)**, garantizando el cumplimiento estricto del Artículo 32 del Reglamento General de Protección de Datos (RGPD) sobre la seguridad en el tratamiento de datos sensibles (documentos de identidad y pruebas de residencia).

---

## 1. Arquitectura Criptográfica (Client-Side Encryption)

El servidor no posee las claves de descifrado y nunca tiene acceso a los datos en texto plano. Todo el proceso de cifrado se realiza en el navegador del usuario (lado del cliente) mediante la **Web Crypto API** antes de la transmisión.

### Flujo de Subida (Registro):
1. **Recopilación y Serialización**: El usuario introduce sus datos en el formulario y adjunta los documentos de identidad y residencia. Los archivos se codifican a formato Base64. Toda la información se unifica en una estructura JSON.
2. **Derivación de Clave (PBKDF2)**: A partir de la contraseña de cifrado introducida por el usuario, el sistema genera una clave criptográfica AES de 256 bits mediante el algoritmo PBKDF2 (Password-Based Key Derivation Function 2) con:
   * **Iteraciones**: 100,000
   * **Función Hash**: SHA-256
   * **Salt**: Sal aleatoria de 16 bytes generada en el navegador (`crypto.getRandomValues`).
3. **Cifrado (AES-GCM)**: El JSON serializado se cifra utilizando el estándar AES-GCM (Galois/Counter Mode) para garantizar confidencialidad e integridad, empleando un Vector de Inicialización (IV) de 12 bytes aleatorio.
4. **Empaquetado y Transmisión**: Se genera un archivo binario único (Blob) con la estructura:
   $$\text{[Salt (16 bytes)]} \ || \ \text{[IV (12 bytes)]} \ || \ \text{[Texto Cifrado (Variable)]}$$
   Este archivo se sube al backend bajo el nombre `registration_<nombre>_<apellido>.enc`.

### Flujo de Descarga (Administración):
1. **Descarga del Binario**: El administrador solicita el archivo `.enc` desde el panel privado de administración.
2. **Extracción de Metadatos**: El panel extrae el Salt (primeros 16 bytes), el IV (siguientes 12 bytes) y el bloque de texto cifrado (el resto del buffer).
3. **Derivación y Descifrado**: El administrador introduce la contraseña correspondiente. El sistema deriva la clave simétrica usando el Salt recuperado y ejecuta el descifrado AES-GCM localmente en memoria. 
4. **Decodificación**: Los datos se cargan en la vista y los archivos Base64 se decodifican a binario únicamente al presionar el botón de descarga, destruyendo la información descifrada al cerrar la sesión o cambiar de vista.

---

## 2. Estructura del Proyecto

```bash
gdpr.deft.work/
├── backend/                  # Servidor de almacenamiento (Zero-Knowledge)
│   ├── uploads/              # Directorio de persistencia de archivos cifrados (.enc)
│   ├── Dockerfile            # Construcción de la imagen Node.js
│   ├── package.json          # Dependencias (Express, Multer, Cors)
│   └── server.js             # API REST (subida, listado, descarga y borrado)
├── frontend/                 # Formulario de registro público
│   ├── index.html            # Interfaz de entrada del usuario
│   ├── style.css             # Estilos de interfaz de usuario
│   └── app.js                # Lógica de cifrado cliente y carga de datos
├── admin-frontend/           # Panel de administración privado
│   ├── admin.html            # Interfaz de auditoría de expedientes
│   ├── style.css             # Estilos del panel de control
│   └── admin.js              # Lógica de descarga, descifrado y renderizado local
├── nginx.conf                # Proxy inverso y reglas de seguridad para el frontend público
├── nginx-admin.conf          # Proxy inverso y reglas para el panel de administración
├── docker-compose.yml        # Orquestación de servicios en contenedores Docker
└── add_dns.py                # Script de automatización DNS para Technitium
```

---

## 3. Seguridad de Red y Proxies (Nginx)

El sistema utiliza dos instancias de Nginx como proxies inversos para garantizar que la API del backend no sea expuesta de forma indebida a internet.

### Configuración del Frontend Público (`nginx.conf`):
* Permite el acceso estático a la página de registro.
* Permite **únicamente** peticiones POST a la ruta exacta `/api/upload` para subir los registros cifrados.
* Bloquea con código **403 Forbidden** cualquier otro intento de consulta o manipulación de la API (como listar directorios o borrar archivos en `/api/`).

### Configuración del Panel Administrativo (`nginx-admin.conf`):
* Sirve la interfaz de control privada (`admin.html`).
* Permite el acceso total a todas las rutas de la API en `/api/` (GET, DELETE, etc.) para que el administrador pueda listar, descargar y depurar expedientes en un entorno controlado y seguro.

---

## 4. Despliegue y Puesta en Marcha

### Requisitos Previos:
* Docker y Docker Compose instalados en la máquina host.
* Python 3.x (opcional, para la automatización DNS).

### Paso 1: Levantar los Servicios

Para arrancar el frontend público de recopilación y el backend de almacenamiento seguro:
```bash
docker compose up -d
```
* Esto levantará `gdpr_backend` (Puerto interno 3000) y `gdpr_frontend` (Puerto público **3001**).

Para levantar adicionalmente el panel administrativo privado:
```bash
docker compose --profile admin up -d
```
* Esto habilitará además el contenedor `gdpr_admin_frontend` en el puerto **3002**.

### Paso 2: Sincronización del DNS Local (Technitium)

Para que el dominio `gdpr.deft.work` resuelva correctamente a la IP de nuestro nodo local (M2 - `192.168.1.75`), se proporciona el script `add_dns.py`. 

Ejecute el script en el entorno de desarrollo:
```bash
python3 add_dns.py
```
* *Nota*: Este script lee automáticamente el token de acceso desde la ruta `/home/pirate/docker/Arquimedes/forge/infra/.env`. Asegúrese de tener configurada la variable `LOCAL_TOKEN`.

---

## 5. Cumplimiento de RGPD

Este desarrollo mitiga de raíz las vulnerabilidades clásicas de la gestión de información de carácter personal mediante:
1. **Minimización de datos en tránsito**: Los datos nunca viajan por la red en texto claro.
2. **Resiliencia ante brechas de seguridad**: En caso de un acceso no autorizado al servidor de base de datos o almacenamiento, un atacante únicamente obtendría archivos `.enc` indescifrables sin la contraseña maestra custodiada por los administradores de la ICE.
3. **Control total de persistencia**: El panel de administración permite la purga definitiva (`DELETE /api/files/:filename`) de los registros una vez procesados o validados de forma oficial, eliminando el archivo físico del disco del servidor inmediatamente (`fs.unlinkSync`).
