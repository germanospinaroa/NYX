import { ImportForm } from './import-form'

export default function NewImportPage() {
  return <div className="stack"><div><h1>Importar agenda</h1><p>Sube un CSV o XLSX. NYX no conserva el archivo original.</p></div><ImportForm /></div>
}
