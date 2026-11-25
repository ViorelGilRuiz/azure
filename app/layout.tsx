import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Azure Exam Lab',description:'Entrenamiento local para Microsoft AZ-900'};
export default function Layout({children}:{children:React.ReactNode}){
  return <html lang="es"><body>{children}</body></html>;
}

