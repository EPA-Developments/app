# Configuración de Medplum (servidor)

Recursos de configuración del servidor Medplum (`https://api.medplum.com.ar`,
proyecto `7f068d7d-4633-46e9-9eff-d52bc03625b9`) que el portal necesita pero que
**no** viven en el código de la app. Se versionan acá como referencia y para
compartirlos con la app clínica / recepción.

> Estos archivos son la fuente de referencia; **la aplicación real se hace en el
> servidor Medplum** (app admin o API). El portal no los carga en runtime.

## `access-policy-paciente-portal.json`

AccessPolicy del rol **paciente** (la que usa el `invite` de Recepción y la que
debería estar como `defaultPatientAccessPolicy` del proyecto).

Cubre todo lo que el portal lee/escribe:

- **Compartimento del paciente** (lectura + escritura donde aplica): `Patient`
  (perfil), `Observation` (biomarcadores y signos vitales), `QuestionnaireResponse`,
  `DocumentReference` (consentimiento), `Communication` (mensajes); y de solo
  lectura por paciente: `DiagnosticReport`, `CarePlan`, `MedicationRequest`,
  `Immunization`, `Coverage`, `Appointment`.
- **Definicional / compartido** (`readonly`): `ObservationDefinition` (rangos),
  `Questionnaire`, `Schedule`, `Slot`, `HealthcareService`, `Practitioner`,
  `Organization`, `Binary`.

`%patient` lo resuelve Medplum al `Patient` del login. Si en tu server no
resuelve, usar `%profile` (para un login de paciente es el mismo `Patient`).

### Cómo aplicarla

1. En la app de Medplum, abrir `AccessPolicy/45ff9a4e-e1c6-48d8-aaae-1932aadf216c`,
   pestaña **JSON**, pegar el contenido del archivo y guardar. (Por API:
   `PUT /fhir/R4/AccessPolicy/45ff9a4e-e1c6-48d8-aaae-1932aadf216c`.)
2. **Project → Default Patient Access Policy** = "Paciente — Portal" (para que los
   nuevos pacientes invitados la hereden).
3. Para pacientes ya creados, confirmar que su `ProjectMembership.access.policy`
   apunta a esta AccessPolicy. Editar este recurso es **retroactivo** para los
   memberships que ya lo referencian.

> `meta.versionId` y `meta.lastUpdated` los gestiona el server; por eso no se
> incluyen en el archivo versionado.
