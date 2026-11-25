export const domains = ['Conceptos de la nube', 'Arquitectura y servicios', 'Administración y gobernanza'];
export const objectives = ['Computación en la nube','Ventajas de la nube','Tipos de servicio','Componentes de Azure','Cómputo','Redes','Almacenamiento','Identidad y seguridad','Costes','Gobernanza y cumplimiento','Administración y despliegue','Supervisión'];
export const modes = {initial:'Evaluación inicial',quick:'Test rápido',domain:'Test por dominio',mock:'Simulacro',adaptive:'Test adaptativo',review:'Repaso de errores',daily:'Desafío diario',timed:'Contrarreloj',survival:'Supervivencia'};
export type Mode = keyof typeof modes;
export const TEST_SIZE=40;
export type Settings = { target:string; minutes:number; theme:'dark'|'light' };
export const defaults:Settings = {target:'2026-12-25',minutes:45,theme:'dark'};
export const guide = 'https://learn.microsoft.com/es-es/credentials/certifications/resources/study-guides/az-900';
export const domainOf = (i:number) => i<3 ? 0 : i<8 ? 1 : 2;
export const dateKey = (ms=Date.now()) => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(ms);
export const percent = (n:number,d:number) => d ? Math.round(100*n/d) : 0;
export type PublicQuestion = {id:string; objective:number; text:string; choices:{id:string;text:string}[]; count:number; difficulty:number; type:string};
export type Feedback = {correct:boolean; keys:string[]; explain:string; choices:Record<string,string>; source:string; tip:string; related?:string};
export const reflections=['Lo sabía','Tenía dudas','He acertado por descarte','He acertado de casualidad','No conocía el concepto'] as const;
export const causes=['Desconocimiento del concepto','Confusión entre servicios','Interpretación incorrecta','Confusión de responsabilidades','Confusión de terminología','Dificultad con un escenario práctico','Precipitación','Exceso de confianza'] as const;
export type Answer = {choice:string[]; confidence:number; seconds:number; reflection?:number; cause?:number; feedback?:Feedback};
export type LearningReport={unanswered:number;previous:number|null;firstSeen:number;overconfidence:number;guesses:number;recurring:number;causes:{index:number;count:number}[];domains:{index:number;correct:number;total:number}[];objectives:{index:number;correct:number;total:number}[];weak:number[]};
export type Session = {id:string; mode:Mode; questions:PublicQuestion[]; answers:Record<string,Answer>; skipped?:Record<string,Feedback>; report?:LearningReport; flags:string[]; position:number; deadline:number|null; finished:number|null; started:number};

