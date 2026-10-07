# RunLoop 🏃‍♂️

> **MVP de Planejador de Rotas de Corrida Circulares** sobre ruas reais, calculadas direto no navegador sem necessidade de backend, contas ou cadastro.

---

## 📋 Sumário
1. [Sobre o Projeto](#sobre-o-projeto)
2. [Como Rodar Localmente](#como-rodar-localmente)
3. [Estrutura de Pastas](#estrutura-de-pastas)
4. [Como Funciona o Algoritmo de Rota Circular](#como-funciona-o-algoritmo-de-rota-circular)
5. [Serviços Utilizados e Escolha do Endpoint](#serviços-utilizados-e-escolha-do-endpoint)
6. [Limitações Reais e Transparência](#limitações-reais-e-transparência)
7. [Atribuição OpenStreetMap](#atribuição-openstreetmap)
8. [Roadmap Futuro (Extensibilidade)](#roadmap-futuro-extensibilidade)
9. [Recomendações para Ambiente de Produção](#recomendações-para-ambiente-de-produção)

---

## 1. Sobre o Projeto

O **RunLoop** foi desenvolvido para corredores que desejam treinar uma distância específica (ex.: 5 km, 10 km ou 21 km) partindo da sua casa ou de um ponto qualquer e retornando exatamente ao mesmo local, sem precisar percorrer o mesmo caminho de ida e volta e sem ter que planejar manualmente curva por curva.

### Principais Funcionalidades:
- **Geração de Circuito Fechado**: Traçado circular inteligente em vias e calçadas reais para pedestres.
- **Convergência Iterativa**: Ajusta dinamicamente o raio do circuito até atingir a distância desejada dentro de uma tolerância padrão de ±10%.
- **Variação de Traçado**: Botão "Gerar outro traçado" cria alternativas explorando outros quadrantes da região.
- **Geolocalização & Ponto Personalizável**: Use seu GPS ou clique/arraste o pino no mapa para definir onde começar.
- **Modo Desenho Manual**: Desenhe livremente no mapa clicando ponto a ponto, com cálculo em tempo real de distância em linha reta (Haversine), botões de desfazer e limpar.
- **Mobile-first**: Interface moderna e adaptada com painel lateral em desktops e bottom sheet em smartphones.

---

## 2. Como Rodar Localmente

O RunLoop utiliza **JavaScript moderno com ES Modules nativos** (`import` / `export`), sem bundlers (Webpack, Vite) e sem dependências de compilação.

> ⚠️ **Atenção Importante:** Devido às políticas de segurança do navegador (CORS), arquivos com ES Modules **não funcionam** se você abrir o arquivo diretamente dando duplo clique (`file:///...`). É obrigatório servi-los através de um servidor HTTP local.

### Opção 1: Usando Python (Recomendado)
Se você tiver o Python instalado:
```bash
# Navegue até a pasta do projeto
cd runloop

# Inicie o servidor HTTP embutido
python -m http.server 8000
```
Em seguida, abra no navegador:
👉 **`http://localhost:8000`**

### Opção 2: Usando Node.js (se instalado)
```bash
npx serve .
# ou
npx http-server . -p 8000
```

### Rodando os Testes Unitários
As funções puras de cálculo geográfico e matemático possuem testes unitários que podem ser executados no terminal via Node.js:
```bash
node tests/geo.test.js
```

---

## 3. Estrutura de Pastas

```
runloop/
├─ index.html              # Estrutura semântica HTML5 e acessibilidade
├─ README.md               # Documentação técnica e guia de execução
├─ css/
│  └─ styles.css           # Estilos modernos, responsivos e tema esportivo
├─ js/
│  ├─ main.js              # Inicialização, eventos e orquestração dos módulos
│  ├─ config.js            # Parâmetros: endpoints OSRM, tolerância (±10%), limites
│  ├─ map.js               # Instância do Leaflet, tiles OSM, camadas e marcadores SVG
│  ├─ geolocation.js       # Tratamento robusto da Geolocation API do navegador
│  ├─ routing.js           # Cliente HTTP OSRM (fetch, AbortController, timeout, CORS)
│  ├─ loop-generator.js    # Algoritmo de geração geométrica e iteração de raio
│  ├─ draw-mode.js         # Lógica de desenho manual e acúmulo de distância
│  ├─ geo.js               # Funções puras: Haversine, destino por rumo, tolerância
│  └─ ui.js                # Gestão de estados (loading, cards, erros, métricas)
└─ tests/
   └─ geo.test.js          # Testes unitários das funções puras de geo.js
```

---

## 4. Como Funciona o Algoritmo de Rota Circular

1. **Cálculo Geométrico Inicial**:
   - Dada a distância desejada $D$, a circunferência ideal seria $C = 2 \pi R$.
   - Como ruas urbanas não formam círculos perfeitos, é aplicado um fator de correção inicial ($\approx 0.68$).
   - O centro do circuito é calculado projetando um vetor a partir do ponto de partida $S$ com distância $R$ e um rumo inicial $\theta$.
   - O ponto de partida $S$ fica situado na borda do círculo, garantindo início e fim suaves e coincidentes.

2. **Distribuição de Waypoints com Variação Orgânica**:
   - São gerados **6 waypoints** (`CONFIG.WAYPOINTS_COUNT = 6`) distribuídos com espaçamento angular uniforme ($60^\circ$) e uma pequena variação angular aleatória por ponto ($\pm 7.5^\circ$), evitando o alinhamento artificial estrito com a grelha de quarteirões.
   - O array ordenado $[S, W_1, W_2, \dots, W_5, S]$ é enviado ao OSRM.

3. **Snapping & Traçado Real no OSRM**:
   - O OSRM ajusta (*snap*) os waypoints para as vias roteáveis a pé mais próximas e calcula o traçado viário real.

4. **Avaliação Multicritério de Qualidade da Rota (`computeRouteQuality`)**:
   - **Reamostragem Equirretangular**: A geometria da rota é reamostrada uniformemente a cada ~20 metros em projeção local métrica.
   - **Indexação Espacial**: As amostras são indexadas em uma grade de células de ~10 metros.
   - **Fração de Sobreposição (`overlapFraction`)**: Uma amostra é considerada repetida se outra amostra, em célula igual ou vizinha ($\le 16$ m), estiver a mais de 150 m de distância ao longo do percurso. Amostras a menos de 150 m do ponto de partida/chegada são ignoradas da contagem para não penalizar a convergência natural do loop.
   - **Maior Trecho Repetido (`longestRepeatedRunMeters`)**: Mensura a maior extensão contínua percorrida em duplicidade.
   - **Retornos em U (`uTurnCount`)**: Detecta variações bruscas de rumo ($> 150^\circ$) em janelas curtas ($\le 40$ m).
   - **Pontuação da Rota (`score`)**: Cada candidata é pontuada pela função de perda (menor é melhor):
     $$\text{score} = w_1 \cdot \text{erroDistanciaRelativo} + w_2 \cdot \text{overlapFraction} + w_3 \cdot \left(\frac{\text{longestRepeatedRunMeters}}{\text{distanciaPedida}}\right) + w_4 \cdot \text{uTurnCount}$$
     Pesos padrão documentados em `config.js`: $w_1 = 2.0$, $w_2 = 2.5$, $w_3 = 1.0$, $w_4 = 0.15$.

5. **Iteração Adaptativa e Seleção Global**:
   - O laço não para prematuramente na primeira rota dentro da distância: continua até encontrar uma rota com distância dentro da tolerância ($\pm 10\%$) **E** sobreposição $\le 8\%$ (`OVERLAP_TARGET`), ou até o limite de 12 requisições (`MAX_TOTAL_REQUESTS`).
   - Se a rota apresentar sobreposição excessiva, a próxima iteração desvia o ângulo do circuito ($+40^\circ$ a $+90^\circ$) e/ou inverte o sentido de circulação (horário/anti-horário), além de ajustar o raio.
   - Todas as rotas candidatas válidas são armazenadas e o sistema seleciona a candidata de **menor score** global. Se nenhuma rota atingir o alvo estrito, a melhor aproximação é exibida acompanhada de um aviso transparente com as métricas reais.

---

## 5. Serviços Utilizados e Escolha do Endpoint

Antes da codificação, foram realizados testes práticos com as APIs públicas disponíveis:

1. **Endpoint Escolhido (Padrão no `config.js`)**:
   - **URL**: `https://routing.openstreetmap.de/routed-foot/route/v1/foot`
   - **Motivo**: Servido pela fundação alemã FOSSGIS e.V., este servidor processa especificamente o perfil de pedestres (`routed-foot`), respeitando calçadas, trilhas de parques e vias exclusivas para pedestres com velocidades realistas a pé (~4 a 5 km/h) e oferece suporte nativo a CORS (`Access-Control-Allow-Origin: *`).
2. **Servidor Demo do Project-OSRM (`router.project-osrm.org`)**:
   - Embora aceite o caminho `/foot`, o servidor de demonstração público do Project-OSRM roda essencialmente com matrizes e velocidades de veículos automotores (carros), ignorando certas conexões de pedestres. Por isso, foi mantido apenas como fallback documentado em `config.js`.

---

## 6. Limitações Reais e Transparência

- **Comportamento do OSRM (Menor Caminho)**: O motor OSRM conecta pares de pontos consecutivos sempre pelo caminho de menor distância/tempo. Em bairros com malha viária esparsa, poucas travessas conectadas ou quadras excessivamente longas, o motor de roteamento pode escolher a mesma via principal na ida e na volta entre waypoints adjacentes.
- **Malha Viária Urbana e Barreiras Físicas**: Rios, rodovias de alta velocidade sem passarelas, ferrovias e condomínios fechados restringem a conectividade pedonal. Em tais locais, pode ser impossível criar um circuito perfeito sem trechos compartilhados; o RunLoop busca a alternativa de menor repetição e avisa o usuário quando o alvo de 8% não puder ser cumprido.
- **Detecção Espacial de Calçadas Opostas**: O algoritmo de qualidade indexa amostras em células de ~10 metros com raio de busca de até 16 metros. Em avenidas onde o corredor de ida usa uma calçada e a volta usa a calçada oposta (distantes 10 a 15 metros entre si), o algoritmo intencionalmente computa o trecho como a mesma via compartilhada, refletindo a experiência do corredor que não deseja correr duas vezes pela mesma avenida.
- **Política de Uso e Rate Limit**: O servidor FOSSGIS/OSRM é comunitário e gratuito. O RunLoop executa requisições sequenciais com pausas controladas (`DELAY_BETWEEN_ATTEMPTS_MS = 250ms`) e teto máximo de 12 requisições por geração.
- **Geolocalização**: A especificação W3C exige conexão segura (`https://` ou `localhost`) e provedor ativo do sistema operacional. Caso o serviço do sistema esteja indisponível, o usuário pode definir o ponto de partida diretamente no mapa com um clique.

---

## 7. Atribuição OpenStreetMap

Os mapas de fundo e a rede viária utilizada para roteamento são fornecidos pela comunidade OpenStreetMap:
- © Colaboradores do [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL).
- Os tiles são carregados diretamente dos servidores oficiais do OSM com atribuição legível preservada no canto do mapa.

---

## 8. Roadmap Futuro (Extensibilidade)

O MVP foi projetado com uma interface preparada e uma estrutura padronizada de dados para fácil expansão nos próximos passos:
- **Histórico Local**: Salvar rotas geradas no navegador para consulta offline.
- **Favoritos**: Marcar circuitos prediletos com nomes personalizados.
- **Exportação GPX / TCX**: Download do arquivo de rota para sincronização com relógios Garmin, Polar, Coros e Strava.
- **Navegação Turn-by-Turn**: Instruções passo a passo de curva na tela durante a corrida.

### Estrutura Padronizada de Rotas:
```javascript
{
  id: "route_1728250000000_abc12",
  type: "auto", // ou 'manual'
  start: { lat: -23.5874, lng: -46.6576 },
  coordinates: [[-23.5874, -46.6576], ...],
  distanceMeters: 5120,
  durationSeconds: 1689,
  requestedMeters: 5000,
  tolerance: {
    requestedKm: 5.0,
    actualKm: 5.12,
    differenceKm: 0.12,
    diffPercent: 2.4,
    isWithinTolerance: true,
    differenceMeters: 120
  },
  createdAt: "2026-10-06T21:30:00.000Z"
}
```

---

## 9. Recomendações para Ambiente de Produção

Para transformar este MVP em um produto comercial escalável com alta demanda:
1. **Subir Instância Própria de OSRM**:
   - Rodar um container Docker com `osrm-backend` (`osrm-routed`) com o arquivo PBF do estado/país desejado e perfil `foot.lua` otimizado para corredores.
2. **Serviços Gerenciados Alternativos**:
   - Provedores com planos pagos com SLA e chaves de API, tais como Stadia Maps, Mapbox Directions API ou GraphHopper.
