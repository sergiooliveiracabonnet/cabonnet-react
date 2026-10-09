# -*- coding: utf-8 -*-
"""Classifica o texto livre da OS em motivo de abertura e ação da equipe.

Regras portadas da análise de revisitas de setembro/2026 (conferida OS a OS
contra as planilhas do ERP). A observação de uma OS concluída tem duas partes:
o que o atendimento registrou na abertura e, depois de "Informações da
Execução:", o que a equipe escreveu ao baixar. O motivo sai da primeira parte;
a ação, da segunda.

É uma leitura por palavras-chave: serve para comparar meses e cidades (o que
cresceu, o que caiu), não para auditar uma OS isolada.
"""

import re
import unicodedata

# ── Motivo de abertura ────────────────────────────────────────────────────────
M_SEMSINAL = "Sem sinal / LOS"
M_QUEDA = "Queda / intermitência"
M_LENT = "Lentidão / oscilação"
M_EQUIP = "Equipamento com defeito"
M_WIFI = "Wi-Fi / configuração"
M_IPTV = "IPTV / dispositivo do cliente"
M_CABO = "Cabo / conector danificado"
M_NAOCOMP = "Técnico não compareceu"
M_SEMDESC = "Sem descrição do problema"

MOTIVOS = [M_SEMSINAL, M_QUEDA, M_LENT, M_EQUIP, M_WIFI, M_IPTV, M_CABO, M_NAOCOMP, M_SEMDESC]

_BOILER = [
    r"HOUVE QUEDA DE ENERGIA[^()]*", r"TEVE QUEDA DE ENERGIA[^()]*", r"QUEDA DE ENERGIA",
    r"NOME DA REDE MUDOU", r"LUZES E COMO ESTAO \(PISCANDO, FIXA OU APAGADA\)",
    r"\(\s*\)\s*(?:OSCILACAO/? ?LENTIDAO|QUEDAS|SEM SINAL)", r"\(\s*\)\s*CNC[^A-Z]*",
    r"RESULTADO DO ISOLADO", r"TESTE ISOLADO", r"EQUIPAMENTOS? REINICIADOS?", r"VERIFICADO OS CABOS", r"MAC LIMPO",
    r"TESTE DE VELOCIDADE", r"RESULTADO DOS TESTES", r"PERIODOS EM QUE OCORRE O PROBLEMA",
]
_SEMSINAL_RX = (r"SEM SINA|SEM INTERNET|SEM CONEX|SEM ACESSO|\bLOS\b|LOS/REG|\bLOSS\b|SEM NAVEG|"
                r"NAO (?:NAVEGA|CONECTA|FUNCIONA|LIGA)|SEM LUZ|ONU OFF|TELEMETRIA OFF|ROTEADOR VERMELH|"
                r"LUZ.{0,25}VERMELH|APAGAD|\bLOZ\b|ONU OFFLINE")
_QUEDA_RX = r"QUEDA|CAINDO|\bCAI\b|CAI MUITO|INTERMIT|DESCONECTA|DERRUB"
_LENT_RX = r"LENTID|LENTA|LENTO|LENTAO|VELOCIDADE|TRAVA|BAIXA VEL|OSCIL|INSTAV|NAO ESTA CHEGANDO"

# ── Ação da equipe ────────────────────────────────────────────────────────────
A_CONECT = "Troca de conector"
A_FONTE = "Troca de fonte"
A_EQUIP = "Troca de ONU / roteador"
A_CABO = "Cabo / drop"
A_REDE = "Rede externa (CTO / sinal)"
A_CONFIG = "Reconfiguração"
A_LIMP = "Limpeza"
A_SINAL = "Ajuste / medição de sinal"
A_POS = "Reposicionamento"
A_NAOEXEC = "Visita não concluída"
A_ORIENT = "Orientação / sem defeito"
A_GENERICO = "Registro genérico"
A_SEMDESC = "Sem descrição"
A_OUTRA = "Outras"

ACOES_LABELS = [A_CONECT, A_FONTE, A_EQUIP, A_CABO, A_REDE, A_CONFIG, A_LIMP, A_SINAL, A_POS,
                A_NAOEXEC, A_ORIENT, A_GENERICO, A_SEMDESC, A_OUTRA]

_EQ = r"(?:EQUIP\w*|ONU\w*|ONT|ROTEADOR\w*|APARELHO|ROUTER)"
_ACOES = [
    (A_FONTE, r"FONTE"),
    (A_EQUIP, r"(?:TROCA\w*|TROCOU|SUBSTITU\w*|NOVO|NOVA)\s.{0,22}" + _EQ + r"|" + _EQ +
     r".{0,15}(?:TROCAD\w*|SUBSTITU\w*|NOVO|NOVA)|FEITO TROCA DA ONU|TROCADO ONU|TROCADO O (?:ROTEADOR|ONU)|TROCA DA ONU|TROCA DOS ROTEADORES"),
    (A_CONECT, r"TROCA\w*.{0,25}CONECTOR|CONECTOR\w*.{0,25}(?:TROCAD|SUBSTITU)|TROCOU.{0,12}CONECTOR|SUBSTITU\w*.{0,20}CONECTOR|"
     r"REFEIT\w*.{0,15}CONECTOR|CONECTORIZ|CONECTOR\w* (?:DANIFIC|QUEBRAD|MOLHAD|RUIM)|(?:NOVO|APLICADO) CONECTOR|"
     r"CONECTOR (?:INTERNO|EXTERNO)|TROCA DO PASSANTE|AMBOS CONECTORES|TROCA CONECTOR|TROCA DE E CONECTOR|FEITA A TROCA\b.{0,30}CTO|TROCADO CONECTOR"),
    (A_CABO, r"TROCA\w*.{0,20}(?:CABO|CABEAMENTO|DROP|FIO)|(?:CABO|DROP).{0,15}(?:TROCAD|SUBSTITU|REFEIT|NOVO)|"
     r"LANC\w*.{0,15}(?:CABO|DROP)|EMENDA|FUSAO|FUSIONAD|ROMPID|ARREBENT|CABO.{0,12}DANIFIC|NOVO (?:CABO|DROP)"),
    (A_REDE, r"CTO.{0,30}(?:SEM SINAL|ATENU|COM PROBLEMA|DANIFIC|ALTO|BAIXO)|SINAL (?:ATENUAD|ALTO|ELEVAD).{0,20}CTO|SINAL ATENUADO|"
     r"FIBRA (?:ESTAVA )?(?:ATENUAD|RUIM)|PASSAD[OA] PARA (?:A )?REDE|PASSAR PARA (?:A )?REDE|ENCAMINH|REDE EXTERNA|SPLITTER|"
     r"\bCEO\b|PROBLEMA (?:NA|DE) REDE|PROBLEMA EXTERNO|PROBLEMA NA CAIXA|EQUIPE DE REDE|\bCOPE\b|CTO SEM SINAL|SINAL ELEVADO|SINAL ALTO"),
    (A_CONFIG, r"RECONFIG|REFEIT\w*.{0,12}CONFIG|CONFIGURA|\bCANAL\b|PPPOE|\bSENHA|NOME DA REDE|BRIDGE|\bDNS\b|\bMAC\b|ATUALIZ|RESETAD|FLASHBOX|WI-?FI|PPOE"),
    (A_LIMP, r"LIMPEZA|LIMPOU|HIGIENIZ"),
    (A_SINAL, r"POTENCIA|DBM|NIVEL DE SINAL|SINAL (?:BAIXO|OK|NORMAL|ESTAVEL|NO PADRAO)|AJUSTE|CURVATURA|MACROCURV|REDE ESTAVEL|"
     r"AVERIGUADO SINAL|REESTABELEC|RESTABELEC"),
    (A_POS, r"REPOSICION|NOVO PONTO|LOCAL SUGERIDO|COLOCAD[OA].{0,20}PAREDE|COLOCOU.{0,20}PAREDE"),
    (A_NAOEXEC, r"AUSENTE|SEM ACESSO|NINGUEM|NAO FOI POSSIVEL|IMPOSSIBIL|NAO ESTAVA (?:NA RESIDENCIA|NO LOCAL|EM CASA)|CLIENTE NAO (?:ESTAVA|ATENDEU|QUIS)"),
    (A_ORIENT, r"ORIENT|SEM (?:DEFEITO|PROBLEMA|FALHA)|DENTRO DO CONTRATADO|ACIMA DO CONTRATADO|"
     r"PROBLEMA (?:DO|DE|NO|COM) (?:CLIENTE|APARELHO|CELULAR|DISPOSITIVO|IPTV|TV|NO IPTV)|IPTV|CLIENTE ABRIU DNV"),
]
_PRIORIDADE = [A_FONTE, A_EQUIP, A_CONECT, A_CABO, A_REDE, A_CONFIG, A_LIMP, A_SINAL, A_POS, A_NAOEXEC, A_ORIENT]


def _u(texto: str) -> str:
    return unicodedata.normalize("NFD", str(texto or "")).encode("ascii", "ignore").decode().upper()


def separar(observacao: str) -> tuple[str, str]:
    """(texto da abertura, texto da execução) de uma observação de OS."""
    t = str(observacao or "").replace("\r", "")
    m = re.search(r"Informações da Execução:", t)
    abertura = t[:m.start()] if m else t
    execucao = ""
    if m:
        e = t[m.end():]
        mm = re.search(r"Obs:(.*?)(?:\nCliente.Respons|\nRG:|\nNome Executante|\nLOCALIZA|$)", e, re.S)
        execucao = (mm.group(1) if mm else e).strip()
    return re.sub(r"\s+", " ", abertura).strip(), re.sub(r"\s+", " ", execucao).strip()


def motivo_abertura(abertura: str) -> str:
    a = _u(abertura)

    def marcado(rotulo: str) -> bool:
        return re.search(r"\(\s*X\s*\)\s*" + rotulo, a) is not None

    if re.search(r"CONSTA COMO EXECUTADA|NAO FOI NINGUEM|NINGUEM (?:FOI|VEIO)", a):
        return M_NAOCOMP
    if marcado("SEM SINAL"):
        return M_SEMSINAL
    if marcado("QUEDAS"):
        return M_QUEDA
    if marcado("OSCILA"):
        return M_LENT
    for rx in _BOILER:
        a = re.sub(rx, " ", a)
    m = re.search(r"(?:INFORMANDO|RELATA|RELATANDO|ALEGA|ASSUNTO:?)\s*(?:QUE)?\s*(?:ESTA|ESTAR)?\s*(.{0,40})", a)
    frag = m.group(1) if m else ""
    if re.match(r"\s*(?:COM )?(?:" + _SEMSINAL_RX + r")", frag) or re.search(_SEMSINAL_RX, frag[:22]):
        return M_SEMSINAL
    if re.search(_QUEDA_RX, frag[:30]):
        return M_QUEDA
    if re.search(_LENT_RX, frag):
        return M_LENT
    if re.search(_SEMSINAL_RX, frag):
        return M_SEMSINAL
    for rotulo, rx in [
        (M_SEMSINAL, _SEMSINAL_RX), (M_QUEDA, _QUEDA_RX), (M_LENT, _LENT_RX + r"|LATENCIA"),
        (M_IPTV, r"IPTV|TV BOX|NETFLIX|JOGO|STREAM|CAMERA"),
        (M_EQUIP, r"FONTE|TROCA (?:DO|DE|DA) (?:EQUIP|ROTEADOR|ONU|APARELHO)|DEFEITO|QUEBRAD|QUEIMAD"),
        (M_WIFI, r"WI-?FI|WIFI|SINAL FRACO|ALCANCE|COBERTURA|MESH|REPETIDOR|SENHA|NOME DA REDE|CONFIGURA|PPPOE"),
        (M_CABO, r"CABO|FIO |ROMPID|ARREBENT|DANIFIC|DROP|CONECTOR|FIBRA"),
    ]:
        if re.search(rx, a):
            return rotulo
    return M_SEMDESC


def acao_equipe(execucao: str) -> str:
    """Ação principal da equipe. Só faz sentido para OS já executada."""
    e = _u(execucao)
    achadas = [nome for nome, rx in _ACOES if re.search(rx, e)]
    if A_NAOEXEC in achadas and not re.search(r"TROCA|FEITO|FEITA", e):
        return A_NAOEXEC
    for nome in _PRIORIDADE:
        if nome in achadas:
            return nome
    if len(re.sub(r"[\W_]+", "", e)) < 3:
        return A_SEMDESC
    if re.search(r"TROCA|TROCAR|NORMALIZ|RESOLVID|FEITO|REALIZAD", e):
        return A_GENERICO
    return A_OUTRA


def classificar(observacoes: str, observacaocritica: str = "") -> dict[str, str]:
    abertura, execucao = separar(observacoes or observacaocritica)
    return {"motivo": motivo_abertura(abertura), "acao": acao_equipe(execucao)}
