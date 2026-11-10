import { useEffect, useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack } from '@astryxdesign/core/HStack';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { ApiError, useRunAction } from '../../data/queries';
import type { Action, ActionResult } from '../../data/types';
import { Facts } from '../../ui/kit';

/**
 * Tile → confirmation naming the node and the action → run on the agent →
 * result. Dangerous actions require the action name to be typed. One run per
 * action is enforced by the agent and the hub rate limit.
 */
export function RunActionDialog({
  action,
  nodeId,
  nodeName,
  open,
  onOpenChange,
}: {
  action: Action | null;
  nodeId: string;
  nodeName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [phase, setPhase] = useState<'confirm' | 'result'>('confirm');
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<ActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useRunAction();

  useEffect(() => {
    if (open) {
      setPhase('confirm');
      setTyped('');
      setResult(null);
      setError(null);
      run.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, action?.id]);

  if (!action) return null;
  const canRun = !action.danger || typed.trim() === action.name;
  const close = () => onOpenChange(false);

  const submit = async () => {
    if (!canRun || run.isPending) return;
    setError(null);
    try {
      const value = await run.mutateAsync({ nodeId, actionId: action.id });
      setResult(value);
      setPhase('result');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The hub did not return a result.');
    }
  };

  const subtitle = `${nodeName} · ${action.type === 'wol' ? 'Wake-on-LAN' : 'Local script'} · ${
    action.allow_api ? 'token-callable' : 'UI only'
  }`;
  const showResult = phase === 'result' && result != null;

  const content = showResult ? (
    <VStack gap={3}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Badge
          variant={result.exit_code === 0 ? 'success' : 'error'}
          label={result.exit_code === 0 ? 'Exited 0' : `Exited ${result.exit_code}`}
        />
        <Text type="supporting">{(result.duration_ms / 1000).toFixed(1)} s</Text>
        {result.truncated ? <Text type="supporting">output truncated to 8 KiB</Text> : null}
      </HStack>
      <Facts
        rows={[
          { label: 'Exit code', value: String(result.exit_code) },
          {
            label: 'Duration',
            value: `${(result.duration_ms / 1000).toFixed(1)} s`,
          },
          { label: 'Run', value: result.run_id.slice(0, 8) },
        ]}
      />
      {result.stdout ? (
        <CodeBlock code={result.stdout} title="stdout" size="sm" width="100%" maxHeight={240} isWrapped />
      ) : null}
      {result.stderr ? (
        <CodeBlock code={result.stderr} title="stderr" size="sm" width="100%" maxHeight={240} isWrapped />
      ) : null}
      {!result.stdout && !result.stderr ? <Text type="supporting">The action printed nothing.</Text> : null}
    </VStack>
  ) : (
    <VStack gap={3}>
      {action.description ? <Text>{action.description}</Text> : null}
      {action.danger ? (
        <TextInput
          label={`Type ${action.name} to confirm this action`}
          value={typed}
          onChange={setTyped}
          onEnter={() => void submit()}
          placeholder={action.name}
          autoComplete="off"
          autoCapitalize="off"
          hasAutoCorrect={false}
          hasSpellCheck={false}
          hasAutoFocus
          width="100%"
        />
      ) : null}
      {error ? <Banner status="error" title={error} collapsible={false} /> : null}
    </VStack>
  );

  const footer = showResult ? (
    <HStack gap={2} hAlign="end" wrap="wrap">
      <Button label="Run again" variant="secondary" onClick={() => setPhase('confirm')} />
      <Button label="Close" variant="primary" onClick={close} />
    </HStack>
  ) : (
    <HStack gap={2} hAlign="end" wrap="wrap">
      <Button label="Cancel" variant="secondary" onClick={close} />
      <Button
        label={run.isPending ? 'Running…' : `Run ${action.name}`}
        variant={action.danger ? 'destructive' : 'primary'}
        isLoading={run.isPending}
        isDisabled={!canRun}
        tooltip={canRun ? undefined : 'Type the action name to enable Run'}
        onClick={() => void submit()}
      />
    </HStack>
  );

  return (
    <Dialog
      isOpen={open}
      onOpenChange={onOpenChange}
      purpose={run.isPending ? 'required' : action.danger ? 'form' : 'info'}
      width={showResult ? 640 : 480}
    >
      <Layout
        header={
          <DialogHeader
            title={showResult ? action.name : `Run ${action.name}?`}
            subtitle={subtitle}
            onOpenChange={onOpenChange}
          />
        }
        content={<LayoutContent>{content}</LayoutContent>}
        footer={<LayoutFooter>{footer}</LayoutFooter>}
      />
    </Dialog>
  );
}
