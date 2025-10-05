import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DollarSign, TrendingUp, Calculator, Send, History, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { squareService } from '@/lib/square';
import { useToast } from '@/hooks/use-toast';

export function ProfitDistribution() {
  const [profits, setProfits] = useState({
    totalProfit: 0,
    platformFee: 0,
    netProfit: 0,
    pendingDistribution: 0
  });
  const [distributions, setDistributions] = useState<any[]>([]);
  const [processing, setProcessing] = useState(false);
  const [squareConfigured, setSquareConfigured] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadProfitData();
    loadDistributions();
    checkSquareConfiguration();
  }, []);

  const checkSquareConfiguration = () => {
    const configured = squareService.isConfigured();
    setSquareConfigured(configured);
    
    const config = squareService.getConfig();
    if (!config?.bankAccountId && configured) {
      toast({
        title: "Bank Account Required",
        description: "Please configure your bank account in Square settings to receive the 10% platform fee",
        variant: "destructive"
      });
    }
  };

  const loadProfitData = async () => {
    // Calculate profits from trading history
    const { data: trades } = await supabase
      .from('trading_history')
      .select('profit_loss')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (trades) {
      const total = trades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
      if (total > 0) {
        setProfits({
          totalProfit: total,
          platformFee: total * 0.1,
          netProfit: total * 0.9,
          pendingDistribution: total * 0.1
        });
      }
    }
  };

  const loadDistributions = async () => {
    const { data } = await supabase
      .from('profit_distributions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (data) setDistributions(data);
  };

  const processDistribution = async () => {
    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Process the real Square payout for the 10% fee
      if (squareConfigured && profits.platformFee > 0) {
        const result = await squareService.processPlatformFeeDistribution(profits.totalProfit);
        
        if (result.success) {
          toast({
            title: "💰 Real Money Transferred!",
            description: `$${profits.platformFee.toFixed(2)} has been sent to your Square bank account. Payout ID: ${result.payoutId}`,
          });

          // Save to database
          await supabase.from('profit_distributions').insert({
            user_id: user.id,
            total_profit: profits.totalProfit,
            platform_fee: profits.platformFee,
            net_profit: profits.netProfit,
            status: 'processed',
            payout_id: result.payoutId,
            created_at: new Date().toISOString()
          });

          loadDistributions();
          setProfits(prev => ({ ...prev, pendingDistribution: 0 }));
        }
      } else {
        // Fallback to Supabase function if Square not configured
        const { data, error } = await supabase.functions.invoke('profit-distribution', {
          body: {
            userId: user.id,
            profit: profits.totalProfit,
            period: {
              start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              end: new Date().toISOString()
            }
          }
        });

        if (error) throw error;

        toast({
          title: "Distribution Calculated",
          description: `Platform fee of $${profits.platformFee.toFixed(2)} recorded. Configure Square to receive real payouts.`,
          variant: "destructive"
        });

        loadDistributions();
        setProfits(prev => ({ ...prev, pendingDistribution: 0 }));
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to process distribution",
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Profit Distribution System - Real Money Transfer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!squareConfigured && (
            <Alert className="border-orange-500 bg-orange-50 dark:bg-orange-950">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Square not configured!</strong> Configure your Square API keys and bank account in the API Configuration tab to receive real money transfers of the 10% platform fee.
              </AlertDescription>
            </Alert>
          )}

          {squareConfigured && (
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <strong>Square Connected!</strong> The 10% platform fee will be automatically transferred to your Square bank account when you process distributions.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Profit</p>
                    <p className="text-2xl font-bold">${profits.totalProfit.toFixed(2)}</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-orange-500">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Your 10% Fee</p>
                    <p className="text-2xl font-bold text-orange-500">${profits.platformFee.toFixed(2)}</p>
                    {squareConfigured && (
                      <p className="text-xs text-green-500 mt-1">→ To Your Bank</p>
                    )}
                  </div>
                  <DollarSign className="h-8 w-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Trader's Profit</p>
                    <p className="text-2xl font-bold text-green-500">${profits.netProfit.toFixed(2)}</p>
                  </div>
                  <DollarSign className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {profits.pendingDistribution > 0 && (
            <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Pending Distribution (Your 10% Fee)</span>
                <span className="text-lg font-bold">${profits.pendingDistribution.toFixed(2)}</span>
              </div>
              <Progress value={10} className="mb-3" />
              <Button 
                onClick={processDistribution}
                disabled={processing}
                className="w-full bg-gradient-to-r from-orange-500 to-red-500"
              >
                <Send className="mr-2 h-4 w-4" />
                {processing ? 'Sending to Your Bank...' : squareConfigured ? 'Send Real Money to My Bank' : 'Process Distribution'}
              </Button>
              {squareConfigured && (
                <p className="text-xs text-center mt-2 text-green-600">
                  This will transfer real money to your connected Square bank account
                </p>
              )}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <History className="h-4 w-4" />
              <span className="font-medium">Recent Distributions</span>
            </div>
            {distributions.map((dist) => (
              <div key={dist.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="text-sm font-medium">
                    {new Date(dist.created_at).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Total: ${dist.total_profit} | Your Fee: ${dist.platform_fee}
                  </p>
                  {dist.payout_id && (
                    <p className="text-xs text-green-500">
                      Payout ID: {dist.payout_id}
                    </p>
                  )}
                </div>
                <Badge variant={dist.status === 'processed' ? 'default' : 'secondary'}>
                  {dist.status}
                </Badge>
              </div>
            ))}
          </div>

          <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
            <p className="text-sm">
              <strong>How it works:</strong> You receive 10% of all profitable trades as a platform fee. 
              {squareConfigured ? (
                <span className="text-green-600 font-bold"> This money is automatically transferred to your Square bank account when you click "Send Real Money to My Bank".</span>
              ) : (
                <span className="text-orange-600"> Configure Square in API settings to receive real money transfers.</span>
              )}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}