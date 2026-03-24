import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Leaf, ArrowRight } from 'lucide-react';

export default function Index() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-6">
          <Leaf className="w-10 h-10 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-display font-bold mb-2">Mundo Prana</h1>
        <p className="text-lg text-secondary font-display font-semibold mb-1">Viandas</p>
        <p className="text-muted-foreground text-sm mb-8">Sistema de gestión de viandas saludables</p>
        
        <Link to="/admin/login">
          <Button size="lg" className="w-full">
            Ingresar como administrador <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
