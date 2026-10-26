# OmniTravel

Para probar localmente, sirve esta carpeta con `python -m http.server 8000` y abre `http://localhost:8000`. En producción, publica los HTML y todos los archivos JavaScript de esta carpeta juntos.

El acceso se valida en `auth.js` y `login.js`. El correo o documento debe identificar exactamente una cuenta con la contraseña indicada. Si la respuesta contiene otra identidad, varias cuentas, un rol desconocido o una cuenta sin aprobar, el acceso se rechaza. Editar las credenciales cancela cualquier comprobación anterior pendiente.

`auth-session.js` guarda la sesión en `sessionStorage`, de forma independiente en cada pestaña. Los tres paneles usan ese mismo módulo y comprueban la identidad antes de actualizar el perfil. Las sesiones anteriores de `localStorage` se eliminan: después de publicar esta corrección, todos deben iniciar sesión nuevamente. Abrir el formulario de acceso permite elegir la cuenta y no redirige automáticamente al usuario anterior. La sesión dura hasta 24 horas y se conserva al recargar la misma pestaña.

El commit base `d27ac44` retiró el inicio de sesión por reconocimiento facial. Se mantiene esa decisión: el registro de rostro continúa, pero una coincidencia facial aproximada no elige qué cuenta abrir. El acceso anterior buscaba el rostro más cercano entre todas las cuentas, aceptaba una sola detección y no comprobaba qué cuenta quería abrir la persona.

Ejecuta `npm test` con Node.js para verificar credenciales, identidades duplicadas, sesiones antiguas, pestañas independientes, expiración, aprobación y respuestas tardías. Las pruebas usan cuentas ficticias y no escriben en la base de datos.

Esta corrección aborda la mezcla de cuentas en el cliente. La aplicación todavía consulta `usuarios` con una clave pública de Supabase y construye la sesión en el navegador. Para proteger los datos también contra peticiones manipuladas hace falta migrar la autenticación a Supabase Auth o un servidor y aplicar políticas RLS basadas en esa identidad. La ofuscación de la clave y las comprobaciones JavaScript no sustituyen esos controles.
